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
import { TheiaMenu } from './theia-menu';

export class TheiaContextMenu extends TheiaMenu {

    public static async openAt(app: TheiaApp, x: number, y: number): Promise<TheiaContextMenu> {
        await app.page.mouse.move(x, y);
        await app.page.mouse.click(x, y, { button: 'right' });
        return TheiaContextMenu.returnWhenVisible(app);
    }

    public static async open(app: TheiaApp, element: () => Promise<ElementHandle<SVGElement | HTMLElement>>): Promise<TheiaContextMenu> {
        const elementHandle = await element();
        await elementHandle.click({ button: 'right' });
        return TheiaContextMenu.returnWhenVisible(app);
    }

    private static async returnWhenVisible(app: TheiaApp): Promise<TheiaContextMenu> {
        const menu = new TheiaContextMenu(app);
        await menu.waitForVisible();
        return menu;
    }

}
