// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { ClipboardService } from '@theia/core/lib/browser/clipboard-service';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { QaapProjectBootstrapService } from '@theia/qaap-mobile-shell/lib/browser/qaap-project-bootstrap-service';
import { createQaapPreviewShare, ensureQaapCloudWorkspace } from './qaap-cloud-workspace-client';
import { QaapMobileEnvPanel } from './qaap-mobile-env-panel';

export const QAAP_CLOUD_OPEN_ENV_COMMAND_ID = 'qaap.cloud.openEnv';

export namespace QaapCloudCommands {
    export const OPEN_ENV: Command = {
        id: QAAP_CLOUD_OPEN_ENV_COMMAND_ID,
        category: 'Qaap',
        label: nls.localize('qaap/cloud/openEnv', 'Deploy environment variables'),
    };
}

@injectable()
export class QaapCloudBootstrapUiContribution implements FrontendApplicationContribution, CommandContribution {

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    @inject(ClipboardService)
    protected readonly clipboard: ClipboardService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected envPanel: QaapMobileEnvPanel | undefined;
    protected shareButton: HTMLButtonElement | undefined;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(QaapCloudCommands.OPEN_ENV, {
            execute: () => this.openEnvPanel(),
        });
    }

    onStart(): void {
        this.bootstrap.onStateChange(() => this.refreshShareButton());
        void this.ensureCloudWorkspace();
    }

    protected async ensureCloudWorkspace(): Promise<void> {
        const uri = this.workspace.workspace?.resource?.toString();
        if (!uri) {
            return;
        }
        await ensureQaapCloudWorkspace({ repoKey: `ws:${uri}`, workspaceUri: uri });
    }

    protected refreshShareButton(): void {
        const phase = this.bootstrap.phase;
        const previewUrl = this.bootstrap.previewUrl;
        if (phase === 'running' && previewUrl) {
            if (!this.shareButton) {
                this.shareButton = this.createShareButton();
                document.body.appendChild(this.shareButton);
            }
            this.shareButton.hidden = false;
        } else {
            if (this.shareButton) {
                this.shareButton.hidden = true;
            }
        }
    }

    protected createShareButton(): HTMLButtonElement {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'qaap-cloud-share-preview-btn';
        btn.innerHTML = '<span class="codicon codicon-link" aria-hidden="true"></span> ' +
            nls.localize('qaap/cloud/sharePreview', 'Share preview');
        btn.addEventListener('click', () => { void this.onSharePreview(); });
        return btn;
    }

    protected async onSharePreview(): Promise<void> {
        const port = this.bootstrap.lastPort;
        if (!port) {
            this.messages.warn(nls.localize('qaap/cloud/noPort', 'No dev server port detected yet.'));
            return;
        }
        const uri = this.workspace.workspace?.resource?.toString();
        const share = await createQaapPreviewShare({
            port,
            repoKey: uri ? `ws:${uri}` : undefined,
        });
        if (!share?.publicUrl) {
            this.messages.error(nls.localize('qaap/cloud/shareFailed', 'Could not create share link.'));
            return;
        }
        try {
            await this.clipboard.writeText(share.publicUrl);
            this.messages.info(nls.localize('qaap/cloud/shareCopied', 'Public preview link copied.'));
        } catch {
            this.messages.info(share.publicUrl);
        }
    }

    /** Called from bootstrap banner actions (injected by patching is not needed — expose for shell). */
    openEnvPanel(): void {
        if (!this.envPanel) {
            this.envPanel = new QaapMobileEnvPanel(this.workspace, document.body);
        }
        void this.envPanel.show();
    }
}
