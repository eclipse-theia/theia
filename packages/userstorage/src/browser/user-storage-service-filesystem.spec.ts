/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import { Container } from 'inversify';

import { UserStorageServiceFilesystemImpl } from './user-storage-service-filesystem';
import { UserStorageService } from './user-storage-service';
import { UserStorageResource } from './user-storage-resource';
import { Emitter, } from '@theia/core/lib/common';
import { ILogger } from '@theia/core/lib/common/logger';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common/';
import { FileSystemPreferences, createFileSystemPreferences } from '@theia/filesystem/lib/browser/filesystem-preferences';
import { FileSystemWatcher, FileChange, FileChangeType } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { PreferenceService } from "@theia/core/lib/browser/preferences";
import { MockPreferenceService } from '@theia/core/lib/browser/preferences/test/mock-preference-service';
import { FileSystemWatcherServer } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { MockFilesystem, MockFilesystemWatcherServer } from '@theia/filesystem/lib/common/test';
import { UserStorageUri } from './user-storage-uri';
import URI from '@theia/core/lib/common/uri';

let testContainer: Container;

let userStorageService: UserStorageServiceFilesystemImpl;

const homeDir = '/home/test';
const THEIA_USER_STORAGE_FOLDER = '.theia';
const userStorageFolder = new URI('file://' + homeDir).resolve(THEIA_USER_STORAGE_FOLDER);
const mockOnFileChangedEmitter = new Emitter<FileChange[]>();
let files: { [key: string]: string; } = {};

beforeAll(async () => {
    testContainer = new Container();

    /* Preference bindings*/
    testContainer.bind(MockPreferenceService).toSelf().inSingletonScope();
    testContainer.bind(PreferenceService).to(MockPreferenceService).inSingletonScope();
    testContainer.bind(FileSystemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        jest.spyOn(preferences, 'get').mockReturnValue({
            'files.watcherExclude': {
                "**/.git/objects/**": true,
                "**/.git/subtree-cache/**": true,
                "**/node_modules/**": true
            }
        });
        return createFileSystemPreferences(preferences);
    }).inSingletonScope();

    /* FS mocks and bindings */
    testContainer.bind(FileSystemWatcherServer).to(MockFilesystemWatcherServer).inSingletonScope();
    testContainer.bind(FileSystemWatcher).toSelf().inSingletonScope().onActivation((_, watcher) => {
        Object.defineProperty(watcher, 'onFilesChanged', { get: () => mockOnFileChangedEmitter.event });
        return watcher;
    });

    /* Mock logger binding*/
    testContainer.bind(ILogger).to(MockLogger);
    /* Stub getCurrentUserHome to return test home directory */
    testContainer.bind(FileSystem).toDynamicValue(ctx => {
        const fs = new MockFilesystem();

        jest.spyOn(fs, 'getCurrentUserHome').mockImplementation(() => Promise.resolve(
            {
                uri: 'file://' + homeDir,
                lastModification: 0,
                isDirectory: true
            }));

        jest.spyOn(fs, 'resolveContent').mockImplementation((uri): Promise<{ stat: FileStat, content: string }> => {
            const content = files[uri];
            return Promise.resolve(
                { stat: { uri: uri, lastModification: 0, isDirectory: false }, content: content }
            );
        });

        jest.spyOn(fs, 'setContent').mockImplementation((filestat, content: string) => {
            files[filestat.uri] = content;
            return Promise.resolve(content);
        });

        jest.spyOn(fs, 'getFileStat').mockImplementation(uri =>
            Promise.resolve({ uri, lastModification: 0, isDirectory: false })
        );

        return fs;
    }).inSingletonScope();
    testContainer.bind(UserStorageService).to(UserStorageServiceFilesystemImpl);
});

describe('User Storage Service (Filesystem implementation)', () => {
    let testFile: string;
    beforeAll(() => {
        testFile = 'test.json';
        userStorageService = testContainer.get<UserStorageServiceFilesystemImpl>(UserStorageService);
    });

    afterAll(() => {
        userStorageService.dispose();
    });

    beforeEach(() => {
        files = {};
    });

    test('Should return a user storage uri from a filesystem uri', () => {

        const test = UserStorageServiceFilesystemImpl.toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile));
        expect(test.scheme).toEqual(UserStorageUri.SCHEME);
        expect(test.toString()).toEqual(UserStorageUri.SCHEME + ':' + testFile);

        const testFragment = UserStorageServiceFilesystemImpl.
            toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile + '#test'));
        expect(testFragment.fragment).toEqual('test');

        const testQuery = UserStorageServiceFilesystemImpl.
            toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile + '?test=1'));
        expect(testQuery.query).toEqual('test=1');

        const testQueryAndFragment = UserStorageServiceFilesystemImpl.
            toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile
                + '?test=1' + '#test'));
        expect(testQueryAndFragment.fragment).toEqual('test');
        expect(testQueryAndFragment.query).toEqual('test=1');
    });

    test('Should return a filesystem uri from a user storage uri', () => {
        const test = UserStorageServiceFilesystemImpl.toFilesystemURI(userStorageFolder, new URI(UserStorageUri.SCHEME + ':' + testFile));

        expect(test.scheme).toEqual('file');
        expect(test.path.toString()).toEqual(homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile);
    });

    test(
        'Should register a client and notifies it of the fs changesby converting them to user storage changes',
        done => {
            userStorageService.onUserStorageChanged(event => {
                const userStorageUri = event.uris[0];
                expect(userStorageUri.scheme).toEqual(UserStorageUri.SCHEME);
                expect(userStorageUri.path.toString()).toEqual(testFile);
                done();
            });

            mockOnFileChangedEmitter.fire([
                {
                    type: FileChangeType.UPDATED,
                    uri: userStorageFolder.resolve(testFile)
                }
            ]);

        }
        , 2000);

    test(
        'Should save the contents correctly using a user storage uri to a filesystem uri',
        async () => {

            const userStorageUri = UserStorageServiceFilesystemImpl.
                toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile));

            await userStorageService.saveContents(userStorageUri, 'test content');

            const newContent = await userStorageService.readContents(userStorageUri);

            expect(newContent).toEqual('test content');
            // Confirm that the URI was transformed to a filesystem uri by accessing it via the fs index
            const fsUri = UserStorageServiceFilesystemImpl.toFilesystemURI(userStorageFolder, userStorageUri);
            expect(files[fsUri.toString()]).toEqual('test content');

        }
        , 2000);

});

describe('User Storage Resource (Filesystem implementation)', () => {
    let userStorageResource: UserStorageResource;
    let testFile: string;

    beforeAll(() => {
        testFile = 'test.json';
        userStorageService = testContainer.get<UserStorageServiceFilesystemImpl>(UserStorageService);
        const userStorageUriTest = UserStorageServiceFilesystemImpl.
            toUserStorageUri(userStorageFolder, new URI('file://' + homeDir + '/' + THEIA_USER_STORAGE_FOLDER + '/' + testFile));
        userStorageResource = new UserStorageResource(userStorageUriTest, userStorageService);
    });

    afterAll(() => {
        userStorageService.dispose();
    });

    beforeEach(() => {
        files = {};
    });

    test('Should return notify client when resource changed underneath', done => {
        userStorageResource.onDidChangeContents(() => {
            done();
        });

        mockOnFileChangedEmitter.fire([
            {
                type: FileChangeType.UPDATED,
                uri: userStorageFolder.resolve(testFile)
            }
        ]);
    }, 2000);

    test('Should save and read correctly to fs', async () => {
        const testContent = 'test content';
        await userStorageResource.saveContents(testContent);
        const testFsUri = UserStorageServiceFilesystemImpl.toFilesystemURI(userStorageFolder, userStorageResource.uri);

        expect(files[testFsUri.toString()]).toEqual(testContent);

        const readTestContent = await userStorageResource.readContents();
        expect(readTestContent).toEqual(testContent);

    }, 2000);
});
