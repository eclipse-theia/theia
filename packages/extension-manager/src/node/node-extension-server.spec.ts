/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as path from 'path';
import * as assert from 'assert';
import { NodeExtensionServer } from './node-extension-server';

describe("NodeExtensionServer", () => {

    it("list", function () {
        this.timeout(4000);

        const server = new NodeExtensionServer(path.resolve(__dirname, '..', '..', 'testdata', 'list'));
        return server.list().then(extensions => {
            assert.deepEqual(extensions, [
                {
                    "author": "",
                    "description": "Theia is a cloud & desktop IDE framework implemented in TypeScript.",
                    "installed": true,
                    "outdated": true,
                    "name": "@theia/core",
                    "version": "0.1.0"
                },
                {
                    "author": "Project Theia",
                    "description": "Theia - Extension Manager",
                    "installed": false,
                    "outdated": false,
                    "name": "@theia/extension-manager",
                    "version": "0.1.0"
                }
            ]);
        });
    });

});