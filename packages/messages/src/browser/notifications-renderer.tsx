/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import * as ReactDOM from 'react-dom';
import * as React from 'react';
import { injectable, inject, postConstruct } from 'inversify';
import { ApplicationShell, CorePreferences } from '@theia/core/lib/browser';
import { NotificationManager } from './notifications-manager';
import { NotificationCenterComponent } from './notification-center-component';
import { NotificationToastsComponent } from './notification-toasts-component';

@injectable()
export class NotificationsRenderer {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(NotificationManager)
    protected readonly manager: NotificationManager;

    @inject(CorePreferences)
    protected readonly corePreferences: CorePreferences;

    @postConstruct()
    protected init(): void {
        this.createOverlayContainer();
        this.render();
    }

    protected container: HTMLDivElement;
    protected createOverlayContainer(): void {
        this.container = window.document.createElement('div');
        this.container.className = 'theia-notifications-overlay';
        if (window.document.body) {
            window.document.body.appendChild(this.container);
        }
    }

    protected render(): void {
        ReactDOM.render(<div>
            <NotificationToastsComponent manager={this.manager} corePreferences={this.corePreferences} />
            <NotificationCenterComponent manager={this.manager} />
        </div>, this.container);
    }

}
