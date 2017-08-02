/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

/* tslint:disable:no-magic-numbers */
import * as path from 'path';
import * as assert from 'assert';
import { ExtensionServer } from '../common/extension-protocol';
import { NodeExtensionServer } from './node-extension-server';

let server: ExtensionServer | undefined;
afterEach(() => {
    if (server) {
        server.dispose();
    }
});

function createServer(): ExtensionServer {
    return new NodeExtensionServer({
        projectPath: path.resolve(__dirname, '..', '..', 'testdata', 'list')
    });
}

describe("NodeExtensionServer", function () {

    it("search", () => {
        this.timeout(10000);
        server = createServer();
        return server.search({
            query: "filesystem scope:theia"
        }).then(extensions => {
            assert.equal(extensions.length, 1, JSON.stringify(extensions, undefined, 2));
            assert.equal(extensions[0].name, '@theia/filesystem');
        });
    });

    it("installed", () => {
        this.timeout(10000);
        server = createServer();

        return server.installed().then(extensions => {
            assert.equal(extensions.length, 2, JSON.stringify(extensions, undefined, 2));
            assert.deepEqual(['@theia/core', '@theia/extension-manager'], extensions.map(e => e.name));
        });
    });

    it("outdated", () => {
        this.timeout(10000);
        server = createServer();

        return server.outdated().then(extensions => {
            assert.equal(extensions.length, 1, JSON.stringify(extensions, undefined, 2));
            assert.equal(extensions[0].name, '@theia/core');
        });
    });

    it("list", function () {
        this.timeout(10000);
        server = createServer();
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
        server = createServer();
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
