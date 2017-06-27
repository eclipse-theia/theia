/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as chai from 'chai';
import * as fs from 'fs-extra';
import * as temp from 'temp';
import URI from '../../application/common/uri';
import { FileUri } from '../../application/node/file-uri';
import { FileSystemNode } from "../../filesystem/node/node-filesystem"
import { FileSystemWatcher } from '../../filesystem/common/filesystem-watcher'
import { IPreferenceServer } from './preference-server';
import { JsonPreferenceServer } from './json-preference-server'

const expect = chai.expect;
const track = temp.track();
const preferencePath = '.theia/prefs.json';

let prefServer: IPreferenceServer;
let fileWatcher: FileSystemWatcher;
let fileSystem: FileSystemNode;
let rootUri: URI;
let preferenceFileUri: URI;

describe('preference-server', () => {

    before(() => {
        console.log("test");
        chai.config.showDiff = true;
        chai.config.includeStack = true;

        rootUri = FileUri.create(track.mkdirSync());
        preferenceFileUri = rootUri.appendPath(preferencePath);
        fs.mkdirSync(FileUri.fsPath(rootUri.appendPath('.theia')));

        fs.writeFileSync(FileUri.fsPath(preferenceFileUri), '{ "showLineNumbers": true }');

        fileSystem = new FileSystemNode(rootUri);
        fileWatcher = new FileSystemWatcher();
        fileSystem.setClient(fileWatcher.getFileSystemClient());
        prefServer = new JsonPreferenceServer(fileSystem, fileWatcher, preferenceFileUri);
    });

    after(() => {
        track.cleanupSync();
    });

    // describe('01 #has preference', () => {

    // it('should return true for the has preference', async () => {
    //     const actual = await prefServer.has("showLineNumbers");
    //     expect(actual).to.be.true;
    // });

    // it('should return false for the has preference', async () => {
    //     const actual = await prefServer.has("missingPreferenceKey");
    //     expect(actual).to.be.false;
    // });

    // });

    // describe('02 #get preference', () => {

    //     it('should get the value for the preference', async () => {
    //         const actual = await prefServer.get("showLineNumbers");
    //         expect(actual).to.be.true;
    //     });

    //     it('should get no value for unknown preference', async () => {
    //         const actual = await prefServer.get("unknownPreference");
    //         expect(actual).to.be.undefined;
    //     });

    // });

    describe('03 #onPreferenceChanged', () => {

        it('should get notified of changed pref', async () => {
            // Make sure, it is `true` by default.
            const initialState = await prefServer.get("showLineNumbers");
            expect(initialState).to.be.true;

            // Modify the content.
            let stat = await fileSystem.getFileStat(preferenceFileUri.toString());
            await fileSystem.setContent(stat, '{ "showLineNumbers": false }');

            let { content } = await fileSystem.resolveContent(FileUri.fsPath(preferenceFileUri));

            expect(content).to.be.equal('{ "showLineNumbers": false }');

            // Check whether it is the expected one.
            // expect(fs.readFileSync(FileUri.fsPath(preferenceFileUri), 'utf8')).to.be.equal('{ "showLineNumbers": false }');
            const updatedState = await prefServer.get("showLineNumbers");
            expect(updatedState).to.be.true;

        })
    });

});