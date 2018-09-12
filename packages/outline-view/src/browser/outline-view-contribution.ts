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

import { injectable, inject, postConstruct } from 'inversify';
import { AbstractViewContribution } from '@theia/core/lib/browser/shell/view-contribution';
import { OutlineViewWidget } from './outline-view-widget';
import { FrontendApplicationContribution, FrontendApplication } from '@theia/core/lib/browser/frontend-application';
import { ApplicationShell, ShellLayoutRestorer } from '@theia/core/lib/browser';
import { FrontendApplicationStateService } from '@theia/core/lib/browser/frontend-application-state';
import { TestWidget } from './test-widget';
import { MessageService } from '@theia/core';

export const OUTLINE_WIDGET_FACTORY_ID = 'outline-view';

@injectable()
export class OutlineViewContribution extends AbstractViewContribution<OutlineViewWidget> implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected applicationShell: ApplicationShell;

    @inject(FrontendApplicationStateService)
    protected applicationStateService: FrontendApplicationStateService;

    @inject(MessageService)
    protected messageService: MessageService;

    @inject(FrontendApplication)
    protected frontendApplication: FrontendApplication;

    @inject(ShellLayoutRestorer)
    protected shellLayoutRestorer: ShellLayoutRestorer;

    constructor() {
        super({
            widgetId: OUTLINE_WIDGET_FACTORY_ID,
            widgetName: 'Outline',
            defaultWidgetOptions: {
                area: 'right',
                rank: 500
            },
            toggleCommandId: 'outlineView:toggle'
        });
    }

    /**
     * COMMENT THIS METHOD TO DISABLE ADDING A TEST WIDGET !!!!!!!!!
     */
    @postConstruct()
    init() {
        this.applicationStateService.reachedState('ready').then(() => {
            setTimeout(() => {
                const widget = new TestWidget(this.messageService, this.frontendApplication, this.shellLayoutRestorer);
                this.applicationShell.addWidget(widget, {
                    area: 'right'
                });
                this.applicationShell.activateWidget(widget.id);

            }, 1);
        });
    }

    async initializeLayout(app: FrontendApplication): Promise<void> {
        await this.openView();
    }
}
