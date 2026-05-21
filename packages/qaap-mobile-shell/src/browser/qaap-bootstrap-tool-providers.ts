// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ToolInvocationContext, ToolProvider, ToolRequest } from '@theia/ai-core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { QaapProjectBootstrapService } from './qaap-project-bootstrap-service';
import {
    formatBootstrapToolResult,
    QAAP_BOOTSTRAP_INSTALL_TOOL_ID,
    QAAP_BOOTSTRAP_OPEN_PREVIEW_TOOL_ID,
    QAAP_BOOTSTRAP_RUN_DEV_TOOL_ID,
    QAAP_BOOTSTRAP_STATUS_TOOL_ID,
    serializeQaapBootstrapState,
} from './qaap-bootstrap-tools-common';

function snapshotJson(service: QaapProjectBootstrapService, message?: string): string {
    return formatBootstrapToolResult(
        serializeQaapBootstrapState(
            service.getStateSnapshot(),
            service.forwardedPorts,
            service.getBootstrapFailureDetail()
        ),
        message
    );
}

@injectable()
export class QaapBootstrapStatusTool implements ToolProvider {

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    getTool(): ToolRequest {
        return {
            id: QAAP_BOOTSTRAP_STATUS_TOOL_ID,
            name: QAAP_BOOTSTRAP_STATUS_TOOL_ID,
            providerName: 'qaap',
            description: 'Returns the current Qaap project bootstrap state: detected framework, install/dev phase, '
                + 'preview URL, port conflicts, and monorepo app selection. Call this before run_dev or open_preview.',
            parameters: {
                type: 'object',
                properties: {},
            },
            handler: async (_args: string, ctx?: ToolInvocationContext): Promise<string> => {
                if (ctx?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                return snapshotJson(this.bootstrap);
            },
        };
    }
}

@injectable()
export class QaapBootstrapInstallTool implements ToolProvider {

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    getTool(): ToolRequest {
        return {
            id: QAAP_BOOTSTRAP_INSTALL_TOOL_ID,
            name: QAAP_BOOTSTRAP_INSTALL_TOOL_ID,
            providerName: 'qaap',
            description: 'Installs workspace dependencies (npm/pnpm/yarn). May auto-start the dev server when install succeeds. '
                + 'Use qaap_bootstrap_status to inspect progress.',
            parameters: {
                type: 'object',
                properties: {},
            },
            handler: async (_args: string, ctx?: ToolInvocationContext): Promise<string> => {
                if (ctx?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                const before = this.bootstrap.getStateSnapshot();
                if (!before.descriptor) {
                    return snapshotJson(this.bootstrap, 'No installable Node project detected in the workspace.');
                }
                if (before.phase === 'installing') {
                    return snapshotJson(this.bootstrap, 'Install already in progress.');
                }
                try {
                    await this.bootstrap.runInstall();
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    return snapshotJson(this.bootstrap, `Install failed: ${msg}`);
                }
                return snapshotJson(this.bootstrap, 'Install started.');
            },
        };
    }
}

@injectable()
export class QaapBootstrapRunDevTool implements ToolProvider {

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    getTool(): ToolRequest {
        return {
            id: QAAP_BOOTSTRAP_RUN_DEV_TOOL_ID,
            name: QAAP_BOOTSTRAP_RUN_DEV_TOOL_ID,
            providerName: 'qaap',
            description: 'Starts or restarts the workspace dev server (does not install). When needsInstall is true, call '
                + 'qaap_bootstrap_install first. Use qaap_bootstrap_status to inspect progress.',
            parameters: {
                type: 'object',
                properties: {},
            },
            handler: async (_args: string, ctx?: ToolInvocationContext): Promise<string> => {
                if (ctx?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                const before = this.bootstrap.getStateSnapshot();
                if (!before.descriptor) {
                    return snapshotJson(this.bootstrap, 'No runnable Node project detected in the workspace.');
                }
                const phase = before.phase;
                if (phase === 'installing' || phase === 'starting') {
                    return snapshotJson(this.bootstrap, 'Bootstrap already in progress.');
                }
                if (phase === 'running' && before.previewUrl) {
                    return snapshotJson(this.bootstrap, 'Dev server already running; use qaap_bootstrap_open_preview to focus preview.');
                }
                const needsInstall = before.needsInstall === true
                    || !before.descriptor.nodeModulesPresent
                    || phase === 'install-failed';
                if (needsInstall) {
                    return snapshotJson(this.bootstrap, 'Dependencies missing; call qaap_bootstrap_install first.');
                }
                try {
                    await this.bootstrap.runDevServer();
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    return snapshotJson(this.bootstrap, `Dev server start failed: ${msg}`);
                }
                return snapshotJson(this.bootstrap, 'Dev server start requested.');
            },
        };
    }
}

@injectable()
export class QaapBootstrapOpenPreviewTool implements ToolProvider {

    @inject(QaapProjectBootstrapService)
    protected readonly bootstrap: QaapProjectBootstrapService;

    getTool(): ToolRequest {
        return {
            id: QAAP_BOOTSTRAP_OPEN_PREVIEW_TOOL_ID,
            name: QAAP_BOOTSTRAP_OPEN_PREVIEW_TOOL_ID,
            providerName: 'qaap',
            description: 'Opens or focuses the in-IDE preview for the running dev server. If preview URL is unknown, '
                + 'probes common local ports or suggests qaap_bootstrap_run_dev.',
            parameters: {
                type: 'object',
                properties: {},
            },
            handler: async (_args: string, ctx?: ToolInvocationContext): Promise<string> => {
                if (ctx?.cancellationToken?.isCancellationRequested) {
                    return JSON.stringify({ error: 'Operation cancelled by user' });
                }
                const before = this.bootstrap.getStateSnapshot();
                if (!before.descriptor) {
                    return snapshotJson(this.bootstrap, 'No project descriptor; open a workspace with package.json first.');
                }
                try {
                    if (before.previewUrl) {
                        await this.bootstrap.focusPreview();
                        return snapshotJson(this.bootstrap, 'Focused existing preview.');
                    }
                    if (before.portInUse || before.lastPort !== undefined || before.phase === 'run-failed') {
                        await this.bootstrap.openExistingPreview();
                        const after = this.bootstrap.getStateSnapshot();
                        if (after.previewUrl) {
                            return snapshotJson(this.bootstrap, 'Attached preview to existing dev server.');
                        }
                        return snapshotJson(this.bootstrap, after.error ?? 'Could not attach to an existing dev server.');
                    }
                    if (before.phase === 'running') {
                        await this.bootstrap.focusPreview();
                        return snapshotJson(this.bootstrap, 'Preview focus requested.');
                    }
                    await this.bootstrap.runDevServer();
                    return snapshotJson(this.bootstrap, 'No preview URL yet; dev server start requested.');
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    return snapshotJson(this.bootstrap, `Open preview failed: ${msg}`);
                }
            },
        };
    }
}
