// *****************************************************************************
// Copyright (C) 2021-2023 logi.cals GmbH, EclipseSource and others.
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

import { defineConfig } from '@playwright/test';

// Note: process.env.CI is always set to true for GitHub Actions

export default defineConfig({
    testDir: './lib/tests',
    testMatch: ['**/*.test.js'],
    workers: process.env.CI ? 1 : 2,
    retries: process.env.CI ? 1 : 0,
    // The number of times to repeat each test, useful for debugging flaky tests
    repeatEach: 1,
    // Timeout for each test in milliseconds.
    timeout: 30 * 1000,
    use: {
        baseURL: 'http://localhost:3000',
        browserName: 'chromium',
        screenshot: 'only-on-failure',
        permissions: ['clipboard-read'],
        viewport: { width: 1920, height: 1080 },
    },
    snapshotDir: './src/tests/snapshots',
    expect: {
        toMatchSnapshot: { threshold: 0.01 }
    },
    preserveOutput: 'failures-only',
    reporter: process.env.CI
        ? [['list'], ['allure-playwright'], ['github']]
        : [['list'], ['allure-playwright']],
    // Reuse Theia backend on port 3000 or start instance before executing the tests
    webServer: {
        command: 'yarn theia:start',
        port: 3000,
        reuseExistingServer: true
    }
});
