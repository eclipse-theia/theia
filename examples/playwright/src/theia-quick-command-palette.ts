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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { ElementHandle } from '@playwright/test';
import { TheiaPageObject } from './theia-page-object';
import { OSUtil, USER_KEY_TYPING_DELAY } from './util';

export class TheiaQuickCommandPalette extends TheiaPageObject {

    selector = '.quick-input-widget';

    async open(): Promise<void> {
        await this.page.keyboard.press(OSUtil.isMacOS ? 'Meta+Shift+p' : 'Control+Shift+p');
        await this.page.waitForSelector(this.selector);
    }

    async isOpen(): Promise<boolean> {
        try {
            await this.page.waitForSelector(this.selector, { timeout: 5000 });
        } catch (err) {
            return false;
        }
        return true;
    }

    async trigger(...commandName: string[]): Promise<void> {
        for (const command of commandName) {
            await this.triggerSingleCommand(command);
        }
    }

    protected async triggerSingleCommand(commandName: string): Promise<void> {
        if (!await this.isOpen()) {
            this.open();
        }
        let selected = await this.selectedCommand();
        while (!(await selected?.innerText() === commandName)) {
            await this.page.keyboard.press('ArrowDown');
            selected = await this.selectedCommand();
        }
        await this.page.keyboard.press('Enter');
    }

    async type(command: string): Promise<void> {
        if (!await this.isOpen()) {
            this.open();
        }
        const input = await this.page.waitForSelector(`${this.selector} .monaco-inputbox .input`);
        if (input != null) {
            await input.focus();
            await input.type(command, { delay: USER_KEY_TYPING_DELAY });
        }
    }

    protected async selectedCommand(): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
        const command = await this.page.waitForSelector(this.selector);
        if (!command) {
            throw new Error('No selected command found!');
        }
        return command.$('.monaco-list-row.focused .monaco-highlighted-label');
    }
}
