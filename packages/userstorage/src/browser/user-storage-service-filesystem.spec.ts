/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { Container } from 'inversify';
import * as chai from 'chai';
import { UserStorageServiceFilesystemImpl } from './user-storage-service-filesystem';
import { UserStorageService } from './user-storage-service';
import { UserStorageResource } from './user-storage-resource';
import { Emitter, } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common/';
import { FileSystemPreferences, createFileSystemPreferences } from '@theia/filesystem/lib/browser/filesystem-preferences';
import { FileSystemWatcher, FileChange, FileChangeType } from '@theia/filesystem/lib/browser/filesystem-watcher';

import { PreferenceService, PreferenceServer } from '@theia/preferences-api/lib/common';
import { MockPreferenceServer } from '@theia/preferences-api/lib/common/test';
import { FileSystemWatcherServer } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { MockFilesystem, MockFilesystemWatcherServer } from '@theia/filesystem/lib/common/test';
import { UserStorageUri } from './user-storage-uri';
import URI from '@theia/core/lib/common/uri';

import * as sinon from 'sinon';

const expect = chai.expect;
let testContainer: Container;

let userStorageService: UserStorageServiceFilesystemImpl;

const homeDir = '/home/test';
const THEIA_USER_STORAGE_FOLDER = '.theia';
const userStorageFolder = new URI('file://' + homeDir).resolve(THEIA_USER_STORAGE_FOLDER);
const mockOnFileChangedEmitter = new Emitter<FileChange[]>();
let files: { [key: string]: string; } = {};

before(async () => {
    testContainer = new Container();

    /* Preference bindings*/
    testContainer.bind(PreferenceService).toSelf().inSingletonScope();
    testContainer.bind(PreferenceServer).to(MockPreferenceServer).inSingletonScope();

    /* FS mocks and bindings */
    testContainer.bind(FileSystemWatcherServer).to(MockFilesystemWatcherServer).inSingletonScope();
    testContainer.bind(FileSystemWatcher).toDynamicValue(ctx => {
        const server = ctx.container.get<FileSystemWatcherServer>(FileSystemWatcherServer);
        const prefs = ctx.container.get<FileSystemPreferences>(FileSystemPreferences);
        const watcher = new FileSystemWatcher(server, prefs);

        sinon.stub(watcher, 'onFilesChanged').get(() =>
            mockOnFileChangedEmitter.event
        );

        return watcher;

    }).inSingletonScope();
    testContainer.bind(FileSystemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get(PreferenceService);
        return createFileSystemPreferences(preferences);
    });

    /* Mock logger binding*/
    testContainer.bind(ILogger).to(MockLogger);
    /* Stub getCurrentUserHome to return test home directory */
    testContainer.bind(FileSystem).toDynamicValue(ctx => {
        const fs = new MockFilesystem();

        sinon.stub(fs, 'getCurrentUserHome').callsFake(() => Promise.resolve(
            {
                uri: 'file://' + homeDir,
                lastModification: 0,
                isDirectory: true
            }));

        sinon.stub(fs, 'resolveContent').callsFake((uri): Promise<{ stat: FileStat, content: string }> => {
            const content = files[uri];
            return Promise.resolve(
                { stat: { uri: uri, lastModification: 0, isDirectory: false }, content: content }
            );
        });

        sinon.stub(fs, 'setContent').callsFake((filestat, content: string) => {
            files[filestat.uri] = content;
            return Promise.resolve(content);
        });

        sinon.stub(fs, 'getFileStat').callsFake(uri =>
            Promise.resolve({ uri, lastModification: 0, isDirectory: false })
        );

        return fs;
    }).inSingletonScope();
    testContainer.bind(UserStorageService).to(UserStorageServiceFilesystemImpl);
});

describe('User Storage Service (Filesystem implementation)', () => {
    let testFile: string;
    before(() => {
        testFile = 'test.json';
        userStorageService = testContainer.get<UserStorageServiceFilesystemImpl>(UserStorageService);
    });

    after(() => {
        userStorageService.dispose();
    });

    beforeEach(() => {
        files = {};
    });

    it('Should return a user storage uri from a filesystem uri', () => {

        const test = UserStorageServiceFilesystemImpl.toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile));
        expect(test.scheme).eq(UserStorageUri.SCHEME);
        expect(test.toString()).eq(UserStorageUri.SCHEME + ':' + testFile);

        const testFragment = UserStorageServiceFilesystemImpl.
            toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile + '#test'));
        expect(testFragment.fragment).eq('test');

        const testQuery = UserStorageServiceFilesystemImpl.
            toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile + '?test=1'));
        expect(testQuery.query).eq('test=1');

        const testQueryAndFragment = UserStorageServiceFilesystemImpl.
            toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile
                + '?test=1' + '#test'));
        expect(testQueryAndFragment.fragment).eq('test');
        expect(testQueryAndFragment.query).eq('test=1');
    });

    it('Should return a filesystem uri from a user storage uri', () => {
        const test = UserStorageServiceFilesystemImpl.toFilesystemURI(userStorageFolder, new URI(UserStorageUri.SCHEME + ':' + testFile));

        expect(test.scheme).eq('file');
        expect(test.path.toString()).eq(homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile);
    });

    it('Should register a client and notifies it of the fs changesby converting them to user storage changes', done => {
        userStorageService.onUserStorageChanged(event => {
            const userStorageUri = event.uris[0];
            expect(userStorageUri.scheme).eq(UserStorageUri.SCHEME);
            expect(userStorageUri.path.toString()).eq(testFile);
            done();
        });

        mockOnFileChangedEmitter.fire([
            {
                type: FileChangeType.UPDATED,
                uri: userStorageFolder.resolve(testFile)
            }
        ]);

    }).timeout(2000);

    it('Should save the contents correctly using a user storage uri to a filesystem uri', async () => {

        const userStorageUri = UserStorageServiceFilesystemImpl.
            toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile));

        await userStorageService.saveContents(userStorageUri, 'test content');

        const newContent = await userStorageService.readContents(userStorageUri);

        expect(newContent).eq('test content');
        // Confirm that the URI was transformed to a filesystem uri by accessing it via the fs index
        const fsUri = UserStorageServiceFilesystemImpl.toFilesystemURI(userStorageFolder, userStorageUri);
        expect(files[fsUri.toString()]).eq('test content');

    }).timeout(2000);

});

describe('User Storage Resource (Filesystem implementation)', () => {
    let userStorageResource: UserStorageResource;
    let testFile: string;

    before(() => {
        testFile = 'test.json';
        userStorageService = testContainer.get<UserStorageServiceFilesystemImpl>(UserStorageService);
        const userStorageUriTest = UserStorageServiceFilesystemImpl.
            toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile));
        userStorageResource = new UserStorageResource(userStorageUriTest, userStorageService);
    });

    after(() => {
        userStorageService.dispose();
    });

    beforeEach(() => {
        files = {};
    });

    it('Should return notify client when resource changed underneath', done => {
        userStorageResource.onDidChangeContents(() => {
            done();
        });

        mockOnFileChangedEmitter.fire([
            {
                type: FileChangeType.UPDATED,
                uri: userStorageFolder.resolve(testFile)
            }
        ]);
    }).timeout(2000);

    it('Should save and read correctly to fs', async () => {
        const testContent = 'test content';
        await userStorageResource.saveContents(testContent);
        const testFsUri = UserStorageServiceFilesystemImpl.toFilesystemURI(userStorageFolder, userStorageResource.uri);

        expect(files[testFsUri.toString()]).eq(testContent);

        const readTestContent = await userStorageResource.readContents();
        expect(readTestContent).eq(testContent);

    }).timeout(2000);
});
