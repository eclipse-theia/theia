/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import * as assert from 'assert';
import { DidStopInstallationParam } from "../common/extension-protocol";
import extensionNodeTestContainer from './test/extension-node-test-container';
import { AppProject } from './app-project';

let appProject: AppProject;
const appProjectPath = path.resolve(__dirname, '..', '..', 'test-resources', 'testproject_temp');

export async function assertInstallation(expectation: {
    added?: string[],
    removed?: string[],
    linked?: string[],
    unlinked?: string[]
}): Promise<void> {
    const waitForWillInstall = new Promise<void>(resolve => appProject.onWillInstall(resolve));
    const waitForDidInstall = new Promise<DidStopInstallationParam>(resolve => appProject.onDidInstall(resolve));

    await waitForWillInstall;
    const result = await waitForDidInstall;

    const pck = fs.readJsonSync(path.resolve(appProjectPath, 'package.json'));
    const installed = Object.keys(pck.dependencies);
    if (expectation.added) {
        for (const extension of expectation.added) {
            assert.equal(true, installed.some(name => name === extension), extension + ' is not generated to package.json');
            assert.equal(true, fs.existsSync(path.resolve(appProjectPath, 'node_modules', extension)), extension + ' is not added');
        }
    }
    if (expectation.removed) {
        for (const extension of expectation.removed) {
            assert.equal(false, installed.some(name => name === extension), extension + ' is generated to package.json');
            assert.equal(false, fs.existsSync(path.resolve(appProjectPath, 'node_modules', extension)), extension + ' is not removed');
        }
    }
    if (expectation.linked) {
        for (const extension of expectation.linked) {
            assert.equal(true, installed.some(name => name === extension), extension + ' is not generated to package.json');
            assert.equal(true, fs.existsSync(path.resolve(appProjectPath, 'node_modules', extension)), extension + ' is not linked');
        }
    }
    if (expectation.unlinked) {
        for (const extension of expectation.unlinked) {
            assert.equal(false, installed.some(name => name === extension), extension + ' is generated to package.json');
            assert.equal(false, fs.existsSync(path.resolve(appProjectPath, 'node_modules', extension)), extension + ' is no unlinked');
        }
    }
    assert.equal(true, fs.existsSync(path.resolve(appProjectPath, 'lib', 'bundle.js')), 'the bundle is not generated');
    assert.equal(false, result.failed, 'the installation is failed');
}

describe("AppProjectInstaller", function () {

    beforeEach(function () {
        this.timeout(50000);
        fs.removeSync(appProjectPath);
        appProject = extensionNodeTestContainer({
            path: appProjectPath,
            target: 'browser',
            npmClient: 'yarn',
            autoInstall: true
        }).get(AppProject);
    });

    afterEach(function () {
        this.timeout(50000);
        appProject.dispose();
        fs.removeSync(appProjectPath);
    });

    it("install local", async function () {
        this.timeout(600000);

        fs.writeJSON(path.resolve(appProjectPath, '.yo-rc.json'), {
            "generator-theia": {
                "localDependencies": {
                    "@theia/core": "../../../core",
                    "@theia/filesystem": "../../../filesystem"
                },
                "node_modulesPath": "../../../../node_modules"
            }
        });
        fs.writeJSON(path.resolve(appProjectPath, 'theia.package.json'), {
            "private": true,
            "dependencies": {
                "@theia/core": "0.1.1",
                "@theia/filesystem": "0.1.1"
            }
        });
        await assertInstallation({
            linked: ['@theia/core', '@theia/filesystem']
        });

        fs.writeJSON(path.resolve(appProjectPath, 'theia.package.json'), {
            "private": true,
            "dependencies": {
                "@theia/core": "0.1.1"
            }
        });
        await assertInstallation({
            linked: ['@theia/core'],
            unlinked: ['@theia/filesystem']
        });
    });

    it("install", async function () {
        this.timeout(1800000);

        fs.writeJSON(path.resolve(appProjectPath, '.yo-rc.json'), {});
        fs.writeJSON(path.resolve(appProjectPath, 'theia.package.json'), {
            "private": true,
            "dependencies": {
                "@theia/core": "0.1.1",
                "@theia/filesystem": "0.1.1"
            }
        });

        await assertInstallation({
            added: ['@theia/core', '@theia/filesystem']
        });

        fs.writeJSON(path.resolve(appProjectPath, 'theia.package.json'), {
            "private": true,
            "dependencies": {
                "@theia/core": "0.1.1"
            }
        });
        await assertInstallation({
            added: ['@theia/core'],
            removed: ['@theia/filesystem']
        });
    });

});
