/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { JsonPreferenceService, IPreferenceServer } from './preference-server';
import { FileSystem } from '../../filesystem/common/filesystem';
import { FileSystemWatcher } from '../../filesystem/common/filesystem-watcher'
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fsXtra from 'fs-extra';
import * as os from 'os';
import URI from '../../application/common/uri';
import { FileUri } from '../../application/node/file-uri';
import { FileSystemNode } from "../../filesystem/node/node-filesystem"


const expect = chai.expect;
let prefService: IPreferenceServer;
let fileWatcher: FileSystemWatcher;
let fs: FileSystem;
const TEST_ROOT = FileUri.create(os.tmpdir()).appendPath("node-fs-root");
const uuidV1 = require('uuid/v1');
let root: URI;
let fileSystemNode: FileSystemNode;
let uri: URI;

before(() => {
    chai.config.showDiff = true;
    chai.config.includeStack = true;
    chai.should();
    chai.use(chaiAsPromised);

    root = TEST_ROOT.appendPath(uuidV1());
    fsXtra.mkdirsSync(FileUri.fsPath(root));

    uri = root.appendPath(".theia/prefs.json");
    fsXtra.createFileSync(FileUri.fsPath(uri));
    fsXtra.writeFileSync(FileUri.fsPath(uri), '{"lineNumbers": "on"}', { encoding: "utf8" });

    fs = new FileSystemNode(root);
    fileWatcher = new FileSystemWatcher();
    prefService = new JsonPreferenceService(fs, fileWatcher, ".theia/prefs.json");

});

after(() => {
    fsXtra.removeSync((FileUri.fsPath(uri)));
    fsXtra.removeSync(FileUri.fsPath(root));
});

// class FileWatcherStub extends FileSystemWatcher {
//     getFileSystemClient(): FileSystemClient {
//         const emitter = this.onFileChangesEmitter
//         return {
//             onFileChanges(event: FileChangesEvent) {
//                 emitter.fire(event)
//             }
//         }
//     }

//     private onFileChangesEmitter = new Emitter<FileChangesEvent>();

//     get onFileChanges(): Event<FileChangesEvent> {
//         return this.onFileChangesEmitter.event;
//     }
// }

describe('preference-service', () => {
    describe('01 #has preference', () => {
        it('should return true for the has preference', () => {
            return expect(prefService.has("lineNumbers")).to.eventually.equal(true);
        });

        it('should return false for the has preference', () => {
            return expect(prefService.has("nonExistingPref")).to.eventually.equal(false);
        });
    });

    describe('02 #get preference', () => {
        it('should get the value for the preference', () => {
            return expect(prefService.get("lineNumbers")).is.eventually.equal("on");
        });

        it('should get no value for unknown preference', () => {
            return expect(prefService.get("unknownPreference")).is.eventually.equal(undefined);
        });
    })

    describe('03 #onPreferenceChanged', () => {
        it('should get notified of changed pref', () => {
            fileSystemNode = new FileSystemNode(root);
            const stat = fileSystemNode.getFileStat(uri.toString());

            stat.then((fileStat) => {
                fileSystemNode.setContent(fileStat, '{"lineNumbers": "off"}');
            });

            // xtra test to try to trigger a change event - remove if not necessary
            // uri = root.appendPath(".theia/prefs2.json");
            // fsXtra.createFileSync(FileUri.fsPath(uri));
            // fsXtra.writeFileSync(FileUri.fsPath(uri), '{"lineNumbers": "on"}', { encoding: "utf8" });
        });
    });
});
