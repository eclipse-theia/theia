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

import { expect, test } from '@playwright/test';
import * as path from 'path';
import { TheiaApp } from '../theia-app';
import { TheiaAppLoader } from '../theia-app-loader';
import { TheiaWorkspace } from '../theia-workspace';
import { TheiaTerminal } from '../theia-terminal';

let app: TheiaApp;

test.describe('Theia Terminal View', () => {

    test.beforeAll(async ({ playwright, browser }) => {
        const ws = new TheiaWorkspace([path.resolve(__dirname, '../../src/tests/resources/sample-files1')]);
        app = await TheiaAppLoader.load({ playwright, browser }, ws);
    });

    test.afterAll(async () => {
        await app.page.close();
    });

    test('should be possible to open a new terminal', async () => {
        const terminal = await app.openTerminal(TheiaTerminal);
        expect(await terminal.isTabVisible()).toBe(true);
        expect(await terminal.isDisplayed()).toBe(true);
        expect(await terminal.isActive()).toBe(true);
    });

    test('should be possible to open two terminals, switch among them, and close them', async () => {
        const terminal1 = await app.openTerminal(TheiaTerminal);
        const terminal2 = await app.openTerminal(TheiaTerminal);
        const allTerminals = [terminal1, terminal2];

        // all terminal tabs should be visible
        for (const terminal of allTerminals) {
            expect(await terminal.isTabVisible()).toBe(true);
        }

        // activate one terminal after the other and check that only this terminal is active
        for (const terminal of allTerminals) {
            await terminal.activate();
            expect(await terminal1.isActive()).toBe(terminal1 === terminal);
            expect(await terminal2.isActive()).toBe(terminal2 === terminal);
        }

        // close all terminals
        for (const terminal of allTerminals) {
            await terminal.activate();
            await terminal.close();
        }

        // check that all terminals are closed
        for (const terminal of allTerminals) {
            expect(await terminal.isTabVisible()).toBe(false);
        }
    });

    test('should allow to write and read terminal contents', async () => {
        const terminal = await app.openTerminal(TheiaTerminal);
        await terminal.write('hello');
        const contents = await terminal.contents();
        expect(contents).toContain('hello');
    });

    test('should allow to submit a command and read output', async () => {
        const terminal = await app.openTerminal(TheiaTerminal);
        if (process.platform === 'win32') {
            await terminal.submit('dir');
        } else {
            await terminal.submit('ls');
        }
        const contents = await terminal.contents();
        expect(contents).toContain('sample.txt');
    });

});
