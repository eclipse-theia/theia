/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { FrontendApplication, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { PROBLEM_KIND } from '../../common/problem-marker';
import { ProblemManager, ProblemStat } from './problem-manager';
import { ProblemWidget } from './problem-widget';

@injectable()
export class ProblemContribution extends AbstractViewContribution<ProblemWidget> implements FrontendApplicationContribution {

    @inject(ProblemManager) protected readonly problemManager: ProblemManager;
    @inject(StatusBar) protected readonly statusBar: StatusBar;

    constructor() {
        super({
            widgetId: PROBLEM_KIND,
            widgetName: 'Problems',
            defaultWidgetOptions: {
                area: 'bottom'
            },
            toggleCommandId: 'problemsView:toggle',
            toggleKeybinding: 'ctrlcmd+shift+m'
        });
    }

    onStart(app: FrontendApplication) {
        this.setStatusBarElement(this.problemManager.getProblemStat());
        this.problemManager.onDidChangeMarkers(() => {
            this.setStatusBarElement(this.problemManager.getProblemStat());
        });
    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView();
    }

    protected setStatusBarElement(problemStat: ProblemStat) {
        this.statusBar.setElement('problem-marker-status', {
            text: `$(times-circle) ${problemStat.errors} $(exclamation-triangle) ${problemStat.warnings}`,
            alignment: StatusBarAlignment.LEFT,
            priority: 10,
            command: this.toggleCommand ? this.toggleCommand.id : undefined
        });
    }
}
