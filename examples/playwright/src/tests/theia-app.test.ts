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

import { expect, test } from '@playwright/test';
import { TheiaAppLoader } from '../theia-app-loader';
import { TheiaApp } from '../theia-app';

test.describe('Theia Application', () => {
    let app: TheiaApp;

    test.afterAll(async () => {
        await app.page.close();
    });

    test('should load and should show main content panel', async ({ playwright, browser }) => {
        app = await TheiaAppLoader.load({ playwright, browser });
        expect(await app.isMainContentPanelVisible()).toBe(true);
    });

});
