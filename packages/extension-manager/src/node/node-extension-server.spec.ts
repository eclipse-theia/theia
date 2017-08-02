/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as fs from 'fs-extra';
import * as assert from 'assert';
import { ExtensionClient, ExtensionServer } from '../common/extension-protocol';
import extensionNodeTestContainer from './test/extension-node-test-container';

let server: ExtensionServer;
const testProjectPath = path.resolve(__dirname, '..', '..', 'testproject');
const appProjectPath = path.resolve(__dirname, '..', '..', 'testproject_temp');

beforeEach(function () {
    fs.removeSync(appProjectPath);
    fs.copySync(testProjectPath, appProjectPath);
    server = extensionNodeTestContainer(appProjectPath).get(ExtensionServer);
});

afterEach(function () {
    server.dispose();
    fs.removeSync(appProjectPath);
});

describe("NodeExtensionServer", function () {

    it("search", function () {
        this.timeout(10000);

        return server.search({
            query: "filesystem scope:theia"
        }).then(extensions => {
            assert.equal(extensions.length, 1, JSON.stringify(extensions, undefined, 2));
            assert.equal(extensions[0].name, '@theia/filesystem');
        });
    });

    it("installed", function () {
        this.timeout(10000);

        return server.installed().then(extensions => {
            assert.equal(extensions.length, 2, JSON.stringify(extensions, undefined, 2));
            assert.deepEqual(['@theia/core', '@theia/extension-manager'], extensions.map(e => e.name));
        });
    });

    it("install", async function () {
        this.timeout(10000);

        const before = await server.installed();
        assert.equal(false, before.some(e => e.name === '@theia/filesystem'), JSON.stringify(before, undefined, 2));

        const onDidChangePackage = new Promise(resolve => {
            server.setClient(<ExtensionClient>{
                onDidChange: function () {
                    resolve();
                }
            });
        });

        server.install("@theia/filesystem");

        await onDidChangePackage;
        return server.installed().then(after => {
            assert.equal(true, after.some(e => e.name === '@theia/filesystem'), JSON.stringify(after, undefined, 2));
        });
    });

    it("uninstall", async function () {
        this.timeout(10000);

        const before = await server.installed();
        assert.equal(true, before.some(e => e.name === '@theia/extension-manager'), JSON.stringify(before, undefined, 2));

        const onDidChangePackage = new Promise(resolve => {
            server.setClient(<ExtensionClient>{
                onDidChange: function () {
                    resolve();
                }
            });
        });

        server.uninstall("@theia/extension-manager");

        await onDidChangePackage;
        return server.installed().then(after => {
            assert.equal(false, after.some(e => e.name === '@theia/extension-manager'), JSON.stringify(after, undefined, 2));
        });
    });

    it("outdated", function () {
        this.timeout(10000);

        return server.outdated().then(extensions => {
            assert.equal(extensions.length, 1, JSON.stringify(extensions, undefined, 2));
            assert.equal(extensions[0].name, '@theia/core');
        });
    });

    it("update", async function () {
        this.timeout(10000);

        const before = await server.outdated();
        assert.equal(true, before.some(e => e.name === '@theia/core'), JSON.stringify(before, undefined, 2));

        const onDidChangePackage = new Promise(resolve => {
            server.setClient(<ExtensionClient>{
                onDidChange: function () {
                    resolve();
                }
            });
        });

        server.update("@theia/core");

        await onDidChangePackage;
        return server.outdated().then(after => {
            assert.equal(false, after.some(e => e.name === '@theia/core'), JSON.stringify(after, undefined, 2));
        });
    });

    it("list", function () {
        this.timeout(10000);

        return server.list().then(extensions => {
            assert.equal(extensions.length, 2, JSON.stringify(extensions, undefined, 2));

            assert.deepEqual([
                {
                    name: '@theia/core',
                    installed: true,
                    outdated: true
                },
                {
                    name: '@theia/extension-manager',
                    installed: true,
                    outdated: false
                }
            ], extensions.map(e =>
                Object.assign({}, {
                    name: e.name,
                    installed: e.installed,
                    outdated: e.outdated
                })
            ));
        });
    });

    it("list with search", function () {
        this.timeout(10000);

        return server.list({
            query: "scope:theia"
        }).then(extensions => {
            const filtered = extensions.filter(e => ['@theia/core', '@theia/filesystem'].indexOf(e.name) !== -1);
            assert.equal(filtered.length, 2, JSON.stringify(filtered, undefined, 2));

            assert.deepEqual([
                {
                    name: '@theia/core',
                    installed: true,
                    outdated: true
                },
                {
                    name: '@theia/filesystem',
                    installed: false,
                    outdated: false
                }
            ], filtered.map(e =>
                Object.assign({}, {
                    name: e.name,
                    installed: e.installed,
                    outdated: e.outdated
                })
            ));
        });
    });

});
