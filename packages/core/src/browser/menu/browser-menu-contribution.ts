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
import { Widget } from '@phosphor/widgets';
import debounce = require('lodash.debounce');
import { ApplicationShell } from '../shell';
import { MenuModelRegistry } from '../../common';
import { FrontendApplicationContribution, FrontendApplication } from '../frontend-application';
import { BrowserMainMenuFactory, MenuBarWidget } from './browser-main-menu-factory';

@injectable()
export class BrowserMenuContribution implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(BrowserMainMenuFactory)
    protected readonly factory: BrowserMainMenuFactory;

    @inject(MenuModelRegistry)
    protected readonly menuRegistry: MenuModelRegistry;

    onStart(app: FrontendApplication): void {
        const logo = this.createLogo();
        app.shell.addWidget(logo, { area: 'top' });
        const menuBar = this.factory.createMenuBar();
        app.shell.addWidget(menuBar, { area: 'top' });
        const update = debounce(() => this.update(), 100);
        this.menuRegistry.onChanged(update);
    }

    get menuBar(): MenuBarWidget | undefined {
        return this.shell.topPanel.widgets.find(w => w instanceof MenuBarWidget) as MenuBarWidget | undefined;
    }

    protected createLogo(): Widget {
        const logo = new Widget();
        logo.id = 'theia:icon';
        logo.addClass('theia-icon');
        return logo;
    }

    protected update(): void {
        if (this.menuBar) {
            this.menuBar.clearMenus();
            this.factory.fillMenuBar(this.menuBar);
        }
    }

}
