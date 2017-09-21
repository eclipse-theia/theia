/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as chaiAsPromised from "chai-as-promised";
import * as fs from 'fs-extra';
import * as temp from 'temp';
import { CustomKeymapsServer } from './keymaps-server';
import { ChokidarFileSystemWatcherServer } from '@theia/filesystem/lib/node/chokidar-filesystem-watcher';
import { FileSystemNode } from '@theia/filesystem/lib/node/node-filesystem';
import { FileSystem } from "@theia/filesystem/lib/common";
import { Logger, ILogger } from "@theia/core/lib/common";

import { FileUri } from '@theia/core/lib/node/file-uri';
import URI from '@theia/core/lib/common/uri';

const kbPath = '.theia/keybindings.json';
let keybindingURI: URI;
let server: CustomKeymapsServer;
const track = temp.track();

before(() => {
    chai.use(chaiAsPromised);
    chai.config.showDiff = true;
    chai.config.includeStack = true;
})

after(() => {
    server.dispose();
    track.cleanupSync();
});

describe('Keybinding JSON watcher', () => {
    beforeEach(() => {
        const rootUri = FileUri.create(track.mkdirSync());
        keybindingURI = rootUri.resolve(kbPath);
        const logger = createLogger();
        fs.mkdirSync(FileUri.fsPath(rootUri.resolve('.theia')));
        fs.writeFileSync(FileUri.fsPath(keybindingURI), `[{
                 command: "testCommand",
                 keybinding:"testKeyBinding",
                 context: "testContext",
                 args: ["testArg1","testArg2"]
             }]`);
        server = new CustomKeymapsServer(createFileSystem(), new ChokidarFileSystemWatcherServer(logger), createLogger(), keybindingURI);

    });

    it("Keybinding server registers a client and sends an event for a json change", done => {
        server.setClient({
            onDidChangeKeymap(event) {
                done();
            }
        });

        const fileContent = `[{
            command: "testCommand",
            keybinding:"testKeyBinding",
            context: "testContext",
            args: ["testArg1","testArg2"]
        }]`;
        fs.writeFileSync(FileUri.fsPath(keybindingURI), fileContent);
    });
});

function createFileSystem(): FileSystem {
    return new FileSystemNode();
}

function createLogger(): ILogger {
    return new Proxy<Logger>({} as any, {
        get: (target, name) => () => {
            if (name.toString().startsWith('is')) {
                return Promise.resolve(false);
            }
            if (name.toString().startsWith('if')) {
                return new Promise(resolve => { });
            }
        }
    });
}



