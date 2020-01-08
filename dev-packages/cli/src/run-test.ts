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

// tslint:disable:no-any

import * as net from 'net';
import * as puppeteer from 'puppeteer';
const collectFiles: (options: TestFileOptions) => string[] = require('mocha/lib/cli/collect-files');

export interface TestFileOptions {
    ignore: string[]
    extension: string[]
    file: string[]
    recursive: boolean
    sort: boolean
    spec: string[]
}

export interface TestOptions {
    start: () => Promise<net.AddressInfo>
    launch?: puppeteer.LaunchOptions
    files?: Partial<TestFileOptions>
    coverage?: boolean
}

export default async function runTest(options: TestOptions): Promise<void> {
    const { start, launch } = options;
    const exit = !(launch && launch.devtools);

    const fileOptions: TestFileOptions = {
        ignore: options.files && options.files.ignore || [],
        extension: options.files && options.files.extension || [],
        file: options.files && options.files.file || [],
        spec: options.files && options.files.spec || [],
        recursive: options.files && options.files.recursive || false,
        sort: options.files && options.files.sort || false
    };

    // quick check whether test files exist
    collectFiles(fileOptions);

    const server = await start();
    const browser = await puppeteer.launch(launch);

    const page = await browser.newPage();
    page.on('dialog', dialog => dialog.dismiss());
    page.on('pageerror', console.error);

    let theiaLoaded = false;
    page.exposeFunction('fireDidUnloadTheia', () => theiaLoaded = false);
    const preLoad = () => {
        if (theiaLoaded) {
            return;
        }
        console.log('loading chai...');
        theiaLoaded = true;
        page.addScriptTag({ path: require.resolve('chai/chai.js') });
        page.evaluate(() =>
            window.addEventListener('beforeunload', () => (window as any)['fireDidUnloadTheia']())
        );
    };
    page.on('frameattached', preLoad);
    page.on('framenavigated', preLoad);

    page.on('load', async () => {
        console.log('loading mocha...');
        // replace console.log by theia logger for mocha
        await page.waitForFunction(() => !!(window as any)['theia']['@theia/core/lib/common/logger'].logger, {
            timeout: 30 * 1000
        });
        await page.addScriptTag({ path: require.resolve('mocha/mocha.js') });
        await page.waitForFunction(() => !!(window as any)['chai'] && !!(window as any)['mocha'] && !!(window as any)['theia'].container, { timeout: 30 * 1000 });

        console.log('loading Theia...');
        await page.evaluate(() => {
            const { FrontendApplicationStateService } = (window as any)['theia']['@theia/core/lib/browser/frontend-application-state'];
            const { PreferenceService } = (window as any)['theia']['@theia/core/lib/browser/preferences/preference-service'];
            const { WorkspaceService } = (window as any)['theia']['@theia/workspace/lib/browser/workspace-service'];

            const container = (window as any)['theia'].container;
            const frontendApplicationState = container.get(FrontendApplicationStateService);
            const preferenceService = container.get(PreferenceService);
            const workspaceService = container.get(WorkspaceService);

            return Promise.all([
                frontendApplicationState.reachedState('ready'),
                preferenceService.ready,
                workspaceService.roots
            ]);
        });

        console.log('loading test files...');
        await page.evaluate(() => {
            // replace require to load modules from theia namespace
            (window as any)['require'] = (moduleName: string) => (window as any)['theia'][moduleName];
            mocha.setup({
                reporter: 'spec',
                ui: 'bdd',
                useColors: true
            });
        });
        const files = collectFiles(fileOptions);
        for (const file of files) {
            await page.addScriptTag({ path: file });
        }

        console.log('running test files...');
        const failures = await page.evaluate(() =>
            new Promise<number>(resolve => mocha.run(resolve))
        );
        if (options.coverage) {
            console.log('collecting test coverage...');
            const [jsCoverage, cssCoverage] = await Promise.all([
                page.coverage.stopJSCoverage(),
                page.coverage.stopCSSCoverage(),
            ]);
            require('puppeteer-to-istanbul').write([...jsCoverage, ...cssCoverage]);
        }
        if (exit) {
            await page.close();
            process.exit(failures > 0 ? 1 : 0);
        }
    });
    if (options.coverage) {
        await Promise.all([
            page.coverage.startJSCoverage(),
            page.coverage.startCSSCoverage()
        ]);
    }
    page.goto(`http://${server.address}:${server.port}`);
}
