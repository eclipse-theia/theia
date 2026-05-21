// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { nls } from '@theia/core/lib/common/nls';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MessageService } from '@theia/core/lib/common/message-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { TerminalService } from '@theia/terminal/lib/browser/base/terminal-service';
import { fetchQaapTerminalSessions, upsertQaapTerminalSessions } from './qaap-cloud-workspace-client';

const PERSIST_INTERVAL_MS = 15_000;

@injectable()
export class QaapTerminalPersistenceContribution implements FrontendApplicationContribution {

    @inject(TerminalService)
    protected readonly terminals: TerminalService;

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    @inject(MessageService)
    protected readonly messages: MessageService;

    protected timer: number | undefined;

    onStart(): void {
        void this.restoreHint();
        this.timer = window.setInterval(() => { void this.persist(); }, PERSIST_INTERVAL_MS);
    }

    onStop(): void {
        if (this.timer !== undefined) {
            window.clearInterval(this.timer);
        }
    }

    protected workspaceKey(): string {
        const uri = this.workspace.workspace?.resource?.toString();
        return uri ? `ws:${uri}` : 'default';
    }

    protected async persist(): Promise<void> {
        const widgets = this.terminals.all;
        if (widgets.length === 0) {
            return;
        }
        await upsertQaapTerminalSessions({
            workspaceKey: this.workspaceKey(),
            terminals: widgets.map(w => ({
                id: w.id,
                title: w.title.label,
                cwd: w.terminalId ? undefined : undefined,
            })),
        });
    }

    protected async restoreHint(): Promise<void> {
        const saved = await fetchQaapTerminalSessions(this.workspaceKey());
        if (saved.terminals.length === 0) {
            return;
        }
        const names = saved.terminals.map(t => t.title).join(', ');
        this.messages.info(nls.localize(
            'qaap/terminal/restoredHint',
            'Previous terminal session restored ({0}). Open Terminal to continue.',
            names
        ));
    }
}
