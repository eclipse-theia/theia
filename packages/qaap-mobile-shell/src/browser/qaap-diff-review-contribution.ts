// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { QaapWorkHubDiffService } from './qaap-work-hub-diff-service';

/** Opens the Work Hub diff-review surface (multi-project tabs when applicable). */
export const QAAP_OPEN_DIFF_REVIEW: Command = {
    id: 'qaap.diff.openReview',
    label: nls.localize('qaap/diff/openReview', 'Review Working Changes'),
};

const DIFF_REVIEW_ROUTE = 'diff-review';

@injectable()
export class QaapDiffReviewContribution implements CommandContribution, FrontendApplicationContribution {

    @inject(QaapWorkHubDiffService)
    protected readonly workHubDiff: QaapWorkHubDiffService;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(QAAP_OPEN_DIFF_REVIEW, {
            execute: () => this.workHubDiff.openDiffInWorkHub(),
        });
    }

    onStart(): void {
        this.consumeRouteFromUrl();
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('message', this.onServiceWorkerMessage);
        }
    }

    onStop(): void {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.removeEventListener('message', this.onServiceWorkerMessage);
        }
    }

    protected readonly onServiceWorkerMessage = (event: MessageEvent): void => {
        const data = event.data;
        if (data && data.type === 'qaap-notification-route' && data.route === DIFF_REVIEW_ROUTE) {
            void this.workHubDiff.openDiffInWorkHub();
        }
    };

    protected consumeRouteFromUrl(): void {
        const params = new URLSearchParams(window.location.search);
        if (params.get('qaap_route') !== DIFF_REVIEW_ROUTE) {
            return;
        }
        params.delete('qaap_route');
        const search = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (search ? `?${search}` : '') + window.location.hash);
        void this.workHubDiff.openDiffInWorkHub();
    }
}
