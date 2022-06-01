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

import { expect } from '@playwright/test';
import { TheiaApp } from '../theia-app';
import { TheiaProblemsView } from '../theia-problem-view';
import test, { page } from './fixtures/theia-fixture';

let app: TheiaApp;

test.describe('Theia Problems View', () => {

    test.beforeAll(async () => {
        app = await TheiaApp.load(page);
    });

    test('should be visible and active after being opened', async () => {
        const problemsView = await app.openView(TheiaProblemsView);
        expect(await problemsView.isTabVisible()).toBe(true);
        expect(await problemsView.isDisplayed()).toBe(true);
        expect(await problemsView.isActive()).toBe(true);
    });

    test("should be opened at the bottom and have the title 'Problems'", async () => {
        const problemsView = await app.openView(TheiaProblemsView);
        expect(await problemsView.isInSidePanel()).toBe(false);
        expect(await problemsView.side()).toBe('bottom');
        expect(await problemsView.title()).toBe('Problems');
    });

    test('should be closable', async () => {
        const problemsView = await app.openView(TheiaProblemsView);
        expect(await problemsView.isClosable()).toBe(true);

        await problemsView.close();
        expect(await problemsView.isTabVisible()).toBe(false);
        expect(await problemsView.isDisplayed()).toBe(false);
        expect(await problemsView.isActive()).toBe(false);
    });

    test("should not throw an error if 'close' is called twice", async () => {
        const problemsView = await app.openView(TheiaProblemsView);
        await problemsView.close();
        await problemsView.close();
    });

});
