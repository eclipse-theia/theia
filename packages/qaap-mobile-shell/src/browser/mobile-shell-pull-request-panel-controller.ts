// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell } from '@theia/core/lib/browser/shell/application-shell';
import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import { MobilePullRequestPanel } from './mobile-pull-request-panel';

export interface MobileShellPullRequestPanelHost {
    scheduleSnapAndUiRefresh(): void;
    refreshBottomBar(): void;
    dismissSheetsAsync(): Promise<void>;
    hideProjectsPanel(): void;
}

export interface MobileShellPullRequestPanelOptions {
    host: MobileShellPullRequestPanelHost;
    shell: ApplicationShell;
}

/** Mobile Work Hub pull-request overlay sheet lifecycle. */
export class MobileShellPullRequestPanelController {

    protected readonly host: MobileShellPullRequestPanelHost;
    protected readonly shell: ApplicationShell;
    protected pullRequestPanel: MobilePullRequestPanel | undefined;

    constructor(options: MobileShellPullRequestPanelOptions) {
        this.host = options.host;
        this.shell = options.shell;
    }

    /** Remove every PR overlay node under the app shell (fixes stacked sheets after re-open). */
    removeAllMobilePrPanelsFromShell(): void {
        this.shell.node.querySelectorAll('.theia-mobile-pr').forEach(el => el.remove());
    }

    isPullRequestPanelShown(): boolean {
        return Boolean(this.shell.node.querySelector('.theia-mobile-pr.theia-mod-visible'));
    }

    disposePullRequestPanel(): void {
        this.pullRequestPanel?.dispose();
        this.pullRequestPanel = undefined;
        this.removeAllMobilePrPanelsFromShell();
    }

    openPullRequestPanel(): void {
        this.disposePullRequestPanel();
        this.pullRequestPanel = new MobilePullRequestPanel({
            onDismiss: () => {
                this.host.scheduleSnapAndUiRefresh();
                this.host.refreshBottomBar();
            },
        });
        this.shell.node.appendChild(this.pullRequestPanel.node);
        this.pullRequestPanel.show();
    }

    async openPullRequestFromInbox(pullRequest: QaapGithubPullRequestSummary): Promise<void> {
        await this.host.dismissSheetsAsync();
        if (this.shell.isExpanded('bottom')) {
            await this.shell.collapsePanel('bottom');
        }
        this.openPullRequestPanel();
        this.pullRequestPanel?.showWithPullRequest(pullRequest);
        this.host.refreshBottomBar();
    }

    hidePullRequestPanel(): void {
        this.disposePullRequestPanel();
    }

    async togglePullRequestPanel(): Promise<void> {
        if (this.isPullRequestPanelShown()) {
            this.disposePullRequestPanel();
            this.host.scheduleSnapAndUiRefresh();
            return;
        }
        this.host.hideProjectsPanel();
        await this.host.dismissSheetsAsync();
        if (this.shell.isExpanded('bottom')) {
            await this.shell.collapsePanel('bottom');
        }
        this.openPullRequestPanel();
        this.host.refreshBottomBar();
    }
}
