// *****************************************************************************
// Copyright (C) 2024 TypeFox GmbH and others.
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

import { ElementHandle, Locator } from '@playwright/test';
import { TheiaApp } from './theia-app';
import { TheiaToolbar } from './theia-toolbar';

export class TheiaNotebookToolbar extends TheiaToolbar {
    public readonly locator: Locator;

    constructor(parentLocator: Locator, app: TheiaApp) {
        super(app);
        this.selector = 'div#notebook-main-toolbar';
        this.locator = parentLocator.locator(this.selector);
    }

    protected override toolBarItemSelector(toolbarItemId = ''): string {
        return `div.theia-notebook-main-toolbar-item${toolbarItemId ? `[id="${toolbarItemId}"]` : ''}`;
    }

    protected override async toolbarElementHandle(): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
        // Use locator instead of page to find the toolbar element.
        return this.locator.elementHandle();
    }

    override async waitForVisible(): Promise<void> {
        // Use locator instead of page to find the toolbar element.
        await this.locator.waitFor({ state: 'visible' });
    }

    override async waitUntilHidden(): Promise<void> {
        // Use locator instead of page to find the toolbar element.
        await this.locator.waitFor({ state: 'hidden' });
    }

    override async waitUntilShown(): Promise<void> {
        // Use locator instead of page to find the toolbar element.
        await this.locator.waitFor({ state: 'visible' });
    }
}
