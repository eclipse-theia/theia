// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { FrontendApplicationContribution } from '@theia/core/lib/browser/frontend-application-contribution';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { QaapDiffReviewWidget } from './qaap-diff-review-widget';

/** Opens the mobile diff-review surface. Wired to the "Diff" bottom-navigation entry. */
export const QAAP_OPEN_DIFF_REVIEW: Command = {
    id: 'qaap.diff.openReview',
    label: nls.localize('qaap/diff/openReview', 'Review Working Changes'),
};

/** Notification route handled by this contribution (see service-worker notificationclick). */
const DIFF_REVIEW_ROUTE = 'diff-review';

@injectable()
export class QaapDiffReviewContribution implements CommandContribution, FrontendApplicationContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(QAAP_OPEN_DIFF_REVIEW, {
            execute: () => this.openReview(),
        });
    }

    onStart(): void {
        // A Web Push notification was clicked while the page was loading fresh.
        this.consumeRouteFromUrl();
        // A Web Push notification was clicked while the app was merely backgrounded.
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
            void this.openReview();
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
        void this.openReview();
    }

    protected async openReview(): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget(QaapDiffReviewWidget.ID);
        if (!widget.isAttached) {
            this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
    }
}
