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
import { Message } from '@phosphor/messaging';
import { ReactWidget } from '@theia/core/lib/browser/widgets/react-widget';
import * as React from 'react';
import { ProgressService } from './progress-service';
import { ProgressReport } from './progress-protocol';

@injectable()
export class ProgressWidget extends ReactWidget {

    static SEARCH_DELAY = 200;

    @inject(ProgressService) protected readonly progressService: ProgressService;

    @postConstruct()
    protected init() {
        this.node.classList.add(ProgressWidget.Styles.PROGRESS_WIDGET);
        this.update();
        this.node.onclick = e => {
            e.stopPropagation();
        };
        this.toDispose.push(this.progressService.onContributionChanged(() => this.update()));
    }

    protected onActivateRequest(msg: Message) {
        super.onActivateRequest(msg);
        this.update();
    }

    protected render(): React.ReactNode {
        return this.renderProgressList();
    }

    protected renderProgressList(): React.ReactNode {
        const progressList: React.ReactNode[] = [];
        this.progressService.progressItems.forEach(progressItem => {
            const item = this.createProgressItem(progressItem);
            progressList.push(item);
        });

        if (progressList.length === 0) {
            return this.noProgressItemsFound();
        }

        return <div id={ProgressWidget.Styles.PROGRESS_MONITOR_LIST_CONTAINER}>{progressList}</div>;
    }

    private createProgressItem(progressItem: ProgressReport): React.ReactNode {
        return <div key={progressItem.id} className={`${ProgressWidget.Styles.PROGRESS_MONITOR} flexcontainer`}>
            <div className='row flexcontainer'>
                <div className={ProgressWidget.Styles.PROGRESS_MONITOR_LEFT_CONTAINER}>{progressItem.location + ': ' + progressItem.task}</div>
                <div className={ProgressWidget.Styles.PROGRESS_MONITOR_RIGHT_CONTAINER}>{(progressItem.workDone / progressItem.totalWork) * 100}</div>
            </div>
        </div>;
    }

    private noProgressItemsFound(): React.ReactNode {
        return <div key={ProgressWidget.Styles.PROGRESS_NO_ITEMS_FOUND} className={`${ProgressWidget.Styles.PROGRESS_MONITOR} flexcontainer`}>
            <div className={`row flexcontainer ${ProgressWidget.Styles.PROGRESS_NO_ITEMS_FOUND} `}>
                <h3>No Progress Items found</h3>
            </div>
        </div>;
    }

}

export namespace ProgressWidget {
    export namespace Styles {
        export const PROGRESS_MONITOR = 'theia-progress-monitor';
        export const PROGRESS_MONITOR_LEFT_CONTAINER = 'theia-progress-monitor-item-container-left';
        export const PROGRESS_MONITOR_RIGHT_CONTAINER = 'theia-progress-monitor-item-container-right';
        export const PROGRESS_MONITOR_CONTENT = 'theia-progress-content';
        export const PROGRESS_WIDGET_DIALOG = 'theia-progress-widget-dialog';
        export const PROGRESS_STATUS_BAR = 'theia-progress-status-bar';
        export const PROGRESS_WIDGET = 'theia-progress-widget';
        export const PROGRESS_MONITOR_LIST_CONTAINER = 'progress-monitor-list-container';
        export const PROGRESS_NO_ITEMS_FOUND = 'theia-no-items-found';
    }
}
