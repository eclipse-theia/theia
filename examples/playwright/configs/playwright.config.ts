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

import { PlaywrightTestConfig } from '@playwright/test';

const config: PlaywrightTestConfig = {
    testDir: '../lib/tests',
    testMatch: ['**/*.js'],
    workers: 1,
    fullyParallel: false,
    // Timeout for each test in milliseconds.
    timeout: 60 * 1000,
    use: {
        baseURL: 'http://localhost:3000',
        browserName: 'chromium',
        permissions: ['clipboard-read'],
        screenshot: 'only-on-failure'
    },
    preserveOutput: 'failures-only',
    reporter: [
        ['list'],
        ['allure-playwright']
    ],
    // Reuse Theia backend on port 3000 or start instance before executing the tests
    webServer: {
        command: 'yarn theia:start',
        port: 3000,
        reuseExistingServer: true
    }
};

export default config;
