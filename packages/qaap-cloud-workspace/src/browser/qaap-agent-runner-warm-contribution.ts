// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { warmAgentRunner } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-task-client';

/**
 * Pre-warms the VPS agent runner when a workspace opens so the first chat message skips
 * cold-start project-info reads and QAIQ CLI startup.
 */
@injectable()
export class QaapAgentRunnerWarmContribution implements FrontendApplicationContribution {

    @inject(WorkspaceService)
    protected readonly workspace: WorkspaceService;

    onStart(): void {
        void this.workspace.ready.then(() => this.warmCurrentWorkspace());
        this.workspace.onWorkspaceLocationChanged(() => {
            void this.warmCurrentWorkspace();
        });
    }

    protected async warmCurrentWorkspace(): Promise<void> {
        await this.workspace.ready;
        if (!this.workspace.opened) {
            return;
        }
        const roots = await this.workspace.roots;
        const root = roots[0]?.resource;
        if (!root) {
            return;
        }
        const cwd = FileUri.fsPath(root);
        if (!cwd) {
            return;
        }
        await warmAgentRunner(cwd);
    }
}
