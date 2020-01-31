/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as net from 'net';
import * as puppeteer from 'puppeteer';
import newTestPage, { TestFileOptions } from './test-page';

export interface TestOptions {
    start: () => Promise<net.AddressInfo>
    launch?: puppeteer.LaunchOptions
    files?: Partial<TestFileOptions>
    coverage?: boolean
}

export default async function runTest(options: TestOptions): Promise<void> {
    const { start, launch } = options;
    const exit = !(launch && launch.devtools);

    const testPage = await newTestPage({
        files: options.files,
        matchAppUrl: () => true, // all urls are application urls
        newPage: async () => {
            const browser = await puppeteer.launch(launch);
            return browser.newPage();
        },
        onWillRun: async () => {
            if (options.coverage) {
                await Promise.all([
                    testPage.coverage.startJSCoverage(),
                    testPage.coverage.startCSSCoverage()
                ]);
            }
        },
        onDidRun: async failures => {
            if (options.coverage) {
                console.log('collecting test coverage...');
                const [jsCoverage, cssCoverage] = await Promise.all([
                    testPage.coverage.stopJSCoverage(),
                    testPage.coverage.stopCSSCoverage(),
                ]);
                require('puppeteer-to-istanbul').write([...jsCoverage, ...cssCoverage]);
            }
            if (exit) {
                await testPage.close();
                process.exit(failures > 0 ? 1 : 0);
            }
        }
    });

    const server = await start();
    await testPage.goto(`http://${server.address}:${server.port}`);
}
