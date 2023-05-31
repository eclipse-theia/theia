// *****************************************************************************
// Copyright (C) 2021 logi.cals GmbH, EclipseSource and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ElementHandle } from '@playwright/test';

import { TheiaApp } from './theia-app';
import { TheiaPageObject } from './theia-page-object';
import { TheiaStatusIndicator } from './theia-status-indicator';

export class TheiaStatusBar extends TheiaPageObject {

    selector = 'div#theia-statusBar';

    protected async statusBarElementHandle(): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
        return this.page.$(this.selector);
    }

    async statusIndicator<T extends TheiaStatusIndicator>(statusIndicatorFactory: { new(app: TheiaApp): T }): Promise<T> {
        return new statusIndicatorFactory(this.app);
    }

    async waitForVisible(): Promise<void> {
        await this.page.waitForSelector(this.selector, { state: 'visible' });
    }

    async isVisible(): Promise<boolean> {
        const statusBar = await this.statusBarElementHandle();
        return !!statusBar && statusBar.isVisible();
    }

}
