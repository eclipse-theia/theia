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

    it("find", () => {
        this.timeout(10000);
        server = createServer();
        return server.search({
            query: "filesystem scope:theia"
        }).then(extensions => {
            assert.equal(extensions.length, 1, JSON.stringify(extensions, undefined, 2));
            assert.equal(extensions[0].name, '@theia/filesystem');
        });
    });

    it("list", function () {
        this.timeout(10000);
        server = createServer();
        return server.list().then(extensions => {
            assert.equal(extensions.length, 2, JSON.stringify(extensions, undefined, 2));

            const extension = extensions.find(ext => ext.name === '@theia/core')!;
            assert.equal(extension.installed, true);
            assert.equal(extension.outdated, true);

            const extension2 = extensions.find(ext => ext.name === '@theia/extension-manager')!;
            assert.equal(extension2.installed, false);
            assert.equal(extension2.outdated, false);
        });
    });

});