/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as path from 'path';
import * as temp from 'temp';
import * as fs from 'fs-extra';
import * as assert from 'assert';
import { InstallationParam, InstallationResult } from '../common/extension-protocol';
import extensionNodeTestContainer from './test/extension-node-test-container';
import { ApplicationProject } from './application-project';

process.on('unhandledRejection', (reason, promise) => {
    throw reason;
});

let appProjectPath: string;
let appProject: ApplicationProject;

export async function assertInstallation(expectation: {
    installed?: string[],
    uninstalled?: string[]
}): Promise<void> {
    const waitForWillInstall = new Promise<InstallationParam>(resolve => appProject.onWillInstall(resolve));
    const waitForDidInstall = new Promise<InstallationResult>(resolve => appProject.onDidInstall(resolve));

    await waitForWillInstall;
    const result = await waitForDidInstall;

    if (expectation.installed) {
        for (const extension of expectation.installed) {
            assert.equal(true, fs.existsSync(path.resolve(appProjectPath, 'node_modules', extension)), extension + ' is not installed');
        }
    }
    if (expectation.uninstalled) {
        for (const extension of expectation.uninstalled) {
            assert.equal(false, fs.existsSync(path.resolve(appProjectPath, 'node_modules', extension)), extension + ' is not uninstalled');
        }
    }
    assert.equal(true, fs.existsSync(path.resolve(appProjectPath, 'lib', 'bundle.js')), 'the bundle is not generated');
    assert.equal(false, result.failed, 'the installation is failed');
}

describe('application-project', function (): void {

    beforeEach(function (): void {
        this.timeout(50000);

        const dir = path.resolve(__dirname, '..', '..', 'application-project-test-temp');
        fs.ensureDirSync(dir);
        appProjectPath = temp.mkdirSync({ dir });
        appProject = extensionNodeTestContainer({
            projectPath: appProjectPath,
            npmClient: 'yarn',
            autoInstall: false,
            watchRegistry: false
        }).get(ApplicationProject);
    });

    afterEach(function (): void {
        this.timeout(50000);
        appProject.dispose();
        fs.removeSync(appProjectPath);
    });

    it.skip('install', async function (): Promise<void> {
        this.timeout(1800000);

        await fs.writeJSON(path.resolve(appProjectPath, 'package.json'), {
            'private': true,
            'dependencies': {
                '@theia/core': '0.1.1',
                '@theia/filesystem': '0.1.1'
            }
        });
        appProject.scheduleInstall();
        await assertInstallation({
            installed: ['@theia/core', '@theia/filesystem']
        });

        await fs.writeJSON(path.resolve(appProjectPath, 'package.json'), {
            'private': true,
            'dependencies': {
                '@theia/core': '0.1.1'
            }
        });
        appProject.scheduleInstall();
        await assertInstallation({
            installed: ['@theia/core'],
            uninstalled: ['@theia/filesystem']
        });
    });

});
