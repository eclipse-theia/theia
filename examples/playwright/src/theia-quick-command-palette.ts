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

import { ElementHandle, expect } from '@playwright/test';
import { TheiaPageObject } from './theia-page-object';
import { OSUtil, USER_KEY_TYPING_DELAY } from './util';

export class TheiaQuickCommandPalette extends TheiaPageObject {

    selector = '.quick-input-widget';

    async open(): Promise<void> {
        await this.page.keyboard.press(OSUtil.isMacOS ? 'Meta+Shift+p' : 'Control+Shift+p');
        await this.page.waitForSelector(this.selector);
    }

    async hide(): Promise<void> {
        await this.page.keyboard.press('Escape');
        await this.page.waitForSelector(this.selector, { state: 'hidden' });
    }

    async waitForVisible(): Promise<void> {
        await this.page.waitForSelector(this.selector, { state: 'visible' });
    }

    async isOpen(): Promise<boolean> {
        return this.page.locator(this.selector).isVisible();
    }

    /**
     * Triggers one or more commands sequentially.
     * When passing multiple command names, subsequent commands expect the previous command
     * to have opened a sub-quick-pick (e.g. `View: Open View...`).
     *
     * @param commandName The command name(s) to trigger.
     */
    async trigger(...commandName: string[]): Promise<void> {
        for (let i = 0; i < commandName.length; i++) {
            await this.triggerSingleCommand(commandName[i]);
            if (i < commandName.length - 1) {
                await this.page.waitForSelector(this.selector, { state: 'visible' });
            }
        }
    }

    protected async triggerSingleCommand(commandName: string): Promise<void> {
        if (!await this.isOpen()) {
            await this.open();
        }
        const input = this.page.locator(`${this.selector} .monaco-inputbox .input`);
        const query = (await input.inputValue()).replace(/^(>|view\s+)/, '').trim();
        const hasMatchingFilter = query.length > 0 && commandName.toLowerCase().includes(query.toLowerCase());

        if (!hasMatchingFilter) {
            await this.type(commandName);
        }

        let selected = await this.selectedCommand();
        let attempts = 0;
        while (selected && await selected.innerText() !== commandName && attempts < 10) {
            await this.page.keyboard.press('ArrowDown');
            selected = await this.selectedCommand();
            attempts++;
        }

        await expect(this.page.locator(`${this.selector} .monaco-list-row.focused .monaco-highlighted-label`).first()).toHaveText(commandName, { timeout: 5000 });
        await this.page.keyboard.press('Enter');
    }

    async type(value: string, confirm = false): Promise<void> {
        if (!await this.isOpen()) {
            await this.open();
        }
        const input = this.page.locator(`${this.selector} .monaco-inputbox .input`);
        await input.focus();
        await input.pressSequentially(value, { delay: USER_KEY_TYPING_DELAY });
        if (confirm) {
            await this.page.keyboard.press('Enter');
        }
    }

    protected async selectedCommand(): Promise<ElementHandle<SVGElement | HTMLElement> | null> {
        const command = await this.page.waitForSelector(this.selector);
        if (!command) {
            throw new Error('No selected command found!');
        }
        return command.$('.monaco-list-row.focused .monaco-highlighted-label');
    }

    async visibleItems(): Promise<ElementHandle<SVGElement | HTMLElement>[]> {
        // FIXME rewrite with locators
        const command = await this.page.waitForSelector(this.selector);
        if (!command) {
            throw new Error('No selected command found!');
        }
        return command.$$('.monaco-highlighted-label');
    }

}
