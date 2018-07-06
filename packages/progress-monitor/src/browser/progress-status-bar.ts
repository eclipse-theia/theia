/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { injectable, inject, postConstruct } from 'inversify';
import { StatusBar, StatusBarAlignment, StatusBarEntry, DefaultFrontendApplicationContribution } from '@theia/core/lib/browser';
import { EditorManager } from '@theia/editor/lib/browser';
import { ProgressDialog } from './progress-dialog';
import { ProgressService } from './progress-service';
import { ProgressWidget } from './progress-widget';

export const PROGRESS_MONITOR_WIDGET_KIND = 'progressMonitorView';

import '../../src/browser/style/index.css';

@injectable()
export class ProgressStatusBar extends DefaultFrontendApplicationContribution {

    private readonly progressNotificationName = 'progress-monitor-notification';

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(ProgressDialog) protected readonly progressDialog: ProgressDialog;
    @inject(ProgressService) protected readonly progressService: ProgressService;

    @postConstruct()
    protected init() {
        this.progressService.onContributionChanged(() => {
            if (this.progressService.progressItems.length === 0) {
                this.statusBar.removeElement(this.progressNotificationName);
                this.progressDialog.closeDialog();
            } else {
                this.addStatusBar();
            }
        });
    }

    private addStatusBar() {
        const statusEntry = {
            alignment: StatusBarAlignment.RIGHT,
            priority: 1,
            text: this.calculatePercentageDoneOverall(),
            onclick: e => {
                this.progressDialog.toggleOpen();
            },
            className: ProgressWidget.Styles.PROGRESS_STATUS_BAR
        } as StatusBarEntry;
        this.statusBar.setElement(this.progressNotificationName, statusEntry);
    }

    private calculatePercentageDoneOverall(): string {
        let percentDone = 0;
        const progressItems = this.progressService.progressItems;
        Array.from(progressItems).map(p => {
            percentDone += (p.workDone / p.totalWork);
        });
        const percentDoneOverall = Math.round((percentDone / progressItems.length) * 100);
        if (progressItems.length > 0) {
            const firstProgressItem = progressItems[0];
            const progressItemText = firstProgressItem.task;
            return `${percentDoneOverall}% ${progressItemText}`;
        }
        return `${percentDoneOverall}% Progress Overall`;
    }

}
