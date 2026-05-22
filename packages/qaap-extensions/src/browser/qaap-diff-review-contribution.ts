// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ApplicationShell, WidgetManager } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { nls } from '@theia/core/lib/common/nls';
import { inject, injectable } from '@theia/core/shared/inversify';
import { QaapDiffReviewWidget } from './qaap-diff-review-widget';

/** Opens the mobile diff-review surface. Wired to the "Diff" bottom-navigation entry. */
export const QAAP_OPEN_DIFF_REVIEW: Command = {
    id: 'qaap.diff.openReview',
    label: nls.localize('qaap/diff/openReview', 'Review Working Changes'),
};

@injectable()
export class QaapDiffReviewContribution implements CommandContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(QAAP_OPEN_DIFF_REVIEW, {
            execute: () => this.openReview(),
        });
    }

    protected async openReview(): Promise<void> {
        const widget = await this.widgetManager.getOrCreateWidget(QaapDiffReviewWidget.ID);
        if (!widget.isAttached) {
            this.shell.addWidget(widget, { area: 'main' });
        }
        await this.shell.activateWidget(widget.id);
    }
}
