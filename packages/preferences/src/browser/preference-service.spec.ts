/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * @jest-environment @theia/core/src/browser/test/jsdom-environment
 */

// tslint:disable:no-unused-expression

import 'reflect-metadata';

import { Container } from 'inversify';

import { Emitter } from '@theia/core/lib/common';
import { PreferenceService, PreferenceProviders, PreferenceServiceImpl } from '@theia/core/lib/browser/preferences';
import { FileSystem } from '@theia/filesystem/lib/common/';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { FileSystemWatcherServer } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { FileSystemPreferences, createFileSystemPreferences } from '@theia/filesystem/lib/browser/filesystem-preferences';
import { ILogger } from '@theia/core/lib/common/logger';
import { UserPreferenceProvider } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { ResourceProvider } from '@theia/core/lib/common/resource';
import { WorkspaceServer } from '@theia/workspace/lib/common/';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { MockFilesystem, MockFilesystemWatcherServer } from '@theia/filesystem/lib/common/test';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { MockResourceProvider } from '@theia/core/lib/common/test/mock-resource-provider';
import { MockWorkspaceServer } from '@theia/workspace/lib/common/test/mock-workspace-server';
import { MockWindowService } from '@theia/core/lib/browser/window/test/mock-window-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';

let testContainer: Container;

let prefService: PreferenceService;

const mockUserPreferenceEmitter = new Emitter<void>();
const mockWorkspacePreferenceEmitter = new Emitter<void>();

beforeAll(async () => {
    testContainer = new Container();

    testContainer.bind(UserPreferenceProvider).toSelf().inSingletonScope();
    testContainer.bind(WorkspacePreferenceProvider).toSelf().inSingletonScope();

    testContainer.bind(PreferenceProviders).toFactory(ctx => () => {
        const userProvider = ctx.container.get(UserPreferenceProvider);
        const workspaceProvider = ctx.container.get(WorkspacePreferenceProvider);

        Object.defineProperty(userProvider, 'onDidPreferencesChanged', {
            get: () => mockUserPreferenceEmitter.event
        });
        Object.defineProperty(workspaceProvider, 'onDidPreferencesChanged', {
            get: () => mockWorkspacePreferenceEmitter.event
        });
        return [userProvider, workspaceProvider];
    });
    testContainer.bind(PreferenceServiceImpl).toSelf().inSingletonScope();

    testContainer.bind(PreferenceService).toDynamicValue(ctx =>
        ctx.container.get(PreferenceServiceImpl)
    ).inSingletonScope();

    testContainer.bind(FileSystemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createFileSystemPreferences(preferences);
    }).inSingletonScope();

    /* Workspace mocks and bindings */
    testContainer.bind(WorkspaceServer).to(MockWorkspaceServer);
    testContainer.bind(WorkspaceService).toSelf();

    /* Window mocks and bindings*/
    testContainer.bind(WindowService).to(MockWindowService);

    /* Resource mocks and bindings */
    testContainer.bind(MockResourceProvider).toSelf().inSingletonScope();
    testContainer.bind(ResourceProvider).toProvider(context =>
        uri => context.container.get(MockResourceProvider).get(uri)
    );

    /* FS mocks and bindings */
    testContainer.bind(FileSystemWatcherServer).to(MockFilesystemWatcherServer);
    testContainer.bind(FileSystemWatcher).toSelf().onActivation((_, watcher) =>
        watcher
    );
    testContainer.bind(FileSystem).to(MockFilesystem);

    /* Logger mock */
    testContainer.bind(ILogger).to(MockLogger);
});

describe('Preference Service', () => {

    beforeEach(() => {
        prefService = testContainer.get<PreferenceService>(PreferenceService);
        const impl = testContainer.get(PreferenceServiceImpl);
        impl.onStart();
    });

    afterEach(() => {
        prefService.dispose();
    });

    test('Should get notified if a provider gets a change', done => {

        const prefValue = true;
        prefService.onPreferenceChanged(pref => {
            try {
                expect(pref.preferenceName).toEqual('testPref');
            } catch (e) {
                done(e);
                return;
            }
            expect(pref.newValue).toEqual(prefValue);
            done();
        });

        const userProvider = testContainer.get(UserPreferenceProvider);
        jest.spyOn(userProvider, 'getPreferences').mockReturnValue({
            'testPref': prefValue
        });

        mockUserPreferenceEmitter.fire(undefined);

    }, 2000);

    test(
        'Should return the preference from the more specific scope (user > workspace)',
        () => {
            const userProvider = testContainer.get(UserPreferenceProvider);
            const workspaceProvider = testContainer.get(WorkspacePreferenceProvider);
            jest.spyOn(userProvider, 'getPreferences').mockReturnValue({
                'test.boolean': true,
                'test.number': 1
            });
            jest.spyOn(workspaceProvider, 'getPreferences').mockReturnValue({
                'test.boolean': false,
                'test.number': 0
            });
            mockUserPreferenceEmitter.fire(undefined);

            let value = prefService.get('test.boolean');
            expect(value).toEqual(false);

            value = prefService.get('test.number');
            expect(value).toEqual(0);
        }
    );

    test(
        'Should return the preference from the less specific scope if the value is removed from the more specific one',
        () => {
            const userProvider = testContainer.get(UserPreferenceProvider);
            const workspaceProvider = testContainer.get(WorkspacePreferenceProvider);
            jest.spyOn(userProvider, 'getPreferences').mockReturnValue({
                'test.boolean': true,
                'test.number': 1
            });
            const stubWorkspace = jest.spyOn(workspaceProvider, 'getPreferences').mockReturnValue({
                'test.boolean': false,
                'test.number': 0
            });
            mockUserPreferenceEmitter.fire(undefined);

            let value = prefService.get('test.boolean');
            expect(value).toEqual(false);

            stubWorkspace.mockRestore();
            mockUserPreferenceEmitter.fire(undefined);

            value = prefService.get('test.boolean');
            expect(value).toEqual(true);
        }
    );

    test(
        'Should throw a TypeError if the preference (reference object) is modified',
        () => {
            const userProvider = testContainer.get(UserPreferenceProvider);
            jest.spyOn(userProvider, 'getPreferences').mockReturnValue({
                'test.immutable': [
                    'test', 'test', 'test'
                ]
            });
            mockUserPreferenceEmitter.fire(undefined);

            const immutablePref: string[] | undefined = prefService.get('test.immutable');
            expect(immutablePref).toBeDefined();
            expect(() => {
                immutablePref!.push('fails');
            }).toThrow(TypeError);
        }
    );

    test(
        'Should still report the more specific preference even though the less specific one changed',
        () => {
            const userProvider = testContainer.get(UserPreferenceProvider);
            const workspaceProvider = testContainer.get(WorkspacePreferenceProvider);
            const stubUser = jest.spyOn(userProvider, 'getPreferences').mockReturnValue({
                'test.boolean': true,
                'test.number': 1
            });
            jest.spyOn(workspaceProvider, 'getPreferences').mockReturnValue({
                'test.boolean': false,
                'test.number': 0
            });
            mockUserPreferenceEmitter.fire(undefined);

            let value = prefService.get('test.number');
            expect(value).toEqual(0);

            stubUser.mockReturnValue({
                'test.boolean': true,
                'test.number': 4
            });
            mockUserPreferenceEmitter.fire(undefined);

            value = prefService.get('test.number');
            expect(value).toEqual(0);
        }
    );
});
