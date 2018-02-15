/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { FrontendApplication } from '@theia/core/lib/browser';
import { StatusBar, StatusBarAlignment } from '@theia/core/lib/browser/status-bar/status-bar';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { PROBLEM_KIND } from '../../common/problem-marker';
import { ProblemManager, ProblemStat } from './problem-manager';
import { ProblemWidget } from './problem-widget';

@injectable()
export class ProblemContribution extends AbstractViewContribution<ProblemWidget> {

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
        this.problemManager.onDidChangeMarkers(() => {
            this.setStatusBarElement(this.problemManager.getProblemStat());
        });
    }

    initializeLayout(app: FrontendApplication): Promise<void> {
        this.setStatusBarElement({
            errors: 0,
            warnings: 0
        });
        return Promise.resolve();
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
