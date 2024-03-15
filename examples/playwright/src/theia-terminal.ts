// *****************************************************************************
// Copyright (C) 2023 EclipseSource and others.
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
import { TheiaContextMenu } from './theia-context-menu';
import { TheiaMenu } from './theia-menu';
import { TheiaView } from './theia-view';

export class TheiaTerminal extends TheiaView {

    constructor(tabId: string, app: TheiaApp) {
        super({
            tabSelector: `#shell-tab-terminal-${getTerminalId(tabId)}`,
            viewSelector: `#terminal-${getTerminalId(tabId)}`
        }, app);
    }

    async submit(text: string): Promise<void> {
        await this.write(text);
        const input = await this.waitForInputArea();
        await input.press('Enter');
    }

    async write(text: string): Promise<void> {
        await this.activate();
        const input = await this.waitForInputArea();
        await input.fill(text);
    }

    async contents(): Promise<string> {
        await this.activate();
        await (await this.openContextMenu()).clickMenuItem('Select All');
        await (await this.openContextMenu()).clickMenuItem('Copy');
        return this.page.evaluate('navigator.clipboard.readText()');
    }

    protected async openContextMenu(): Promise<TheiaMenu> {
        await this.activate();
        return TheiaContextMenu.open(this.app, () => this.waitForVisibleView());
    }

    protected async waitForInputArea(): Promise<ElementHandle<SVGElement | HTMLElement>> {
        const view = await this.waitForVisibleView();
        return view.waitForSelector('.xterm-helper-textarea');
    }

    protected async waitForVisibleView(): Promise<ElementHandle<SVGElement | HTMLElement>> {
        return this.page.waitForSelector(this.viewSelector, { state: 'visible' });
    }

}

function getTerminalId(tabId: string): string {
    return tabId.substring(tabId.lastIndexOf('-') + 1);
}
