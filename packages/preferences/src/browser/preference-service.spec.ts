/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// tslint:disable:no-unused-expression

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { Container } from 'inversify';
import * as chai from 'chai';
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
import * as sinon from 'sinon';

disableJSDOM();

const expect = chai.expect;
let testContainer: Container;

let prefService: PreferenceService;

const mockUserPreferenceEmitter = new Emitter<void>();
const mockWorkspacePreferenceEmitter = new Emitter<void>();

before(async () => {
    testContainer = new Container();

    testContainer.bind(UserPreferenceProvider).toSelf().inSingletonScope();
    testContainer.bind(WorkspacePreferenceProvider).toSelf().inSingletonScope();

    testContainer.bind(PreferenceProviders).toFactory(ctx => () => {
        const userProvider = ctx.container.get(UserPreferenceProvider);
        const workspaceProvider = ctx.container.get(WorkspacePreferenceProvider);

        sinon.stub(userProvider, 'onDidPreferencesChanged').get(() =>
            mockUserPreferenceEmitter.event
        );
        sinon.stub(workspaceProvider, 'onDidPreferencesChanged').get(() =>
            mockWorkspacePreferenceEmitter.event
        );
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

describe('Preference Service', function () {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        prefService = testContainer.get<PreferenceService>(PreferenceService);
        const impl = testContainer.get(PreferenceServiceImpl);
        impl.onStart();
    });

    afterEach(() => {
        prefService.dispose();
    });

    it('Should get notified if a provider gets a change', function (done) {

        const prefValue = true;
        prefService.onPreferenceChanged(pref => {
            try {
                expect(pref.preferenceName).eq('testPref');
            } catch (e) {
                stubGet.restore();
                done(e);
                return;
            }
            expect(pref.newValue).eq(prefValue);
            stubGet.restore();
            done();
        });

        const userProvider = testContainer.get(UserPreferenceProvider);
        const stubGet = sinon.stub(userProvider, 'getPreferences').returns({
            'testPref': prefValue
        });

        mockUserPreferenceEmitter.fire(undefined);

    }).timeout(2000);

    it('Should return the preference from the more specific scope (user > workspace)', () => {
        const userProvider = testContainer.get(UserPreferenceProvider);
        const workspaceProvider = testContainer.get(WorkspacePreferenceProvider);
        const stubUser = sinon.stub(userProvider, 'getPreferences').returns({
            'test.boolean': true,
            'test.number': 1
        });
        const stubWorkspace = sinon.stub(workspaceProvider, 'getPreferences').returns({
            'test.boolean': false,
            'test.number': 0
        });
        mockUserPreferenceEmitter.fire(undefined);

        let value = prefService.get('test.boolean');
        expect(value).to.be.false;

        value = prefService.get('test.number');
        expect(value).equals(0);

        [stubUser, stubWorkspace].forEach(stub => {
            stub.restore();
        });
    });

    it('Should return the preference from the less specific scope if the value is removed from the more specific one', () => {
        const userProvider = testContainer.get(UserPreferenceProvider);
        const workspaceProvider = testContainer.get(WorkspacePreferenceProvider);
        const stubUser = sinon.stub(userProvider, 'getPreferences').returns({
            'test.boolean': true,
            'test.number': 1
        });
        const stubWorkspace = sinon.stub(workspaceProvider, 'getPreferences').returns({
            'test.boolean': false,
            'test.number': 0
        });
        mockUserPreferenceEmitter.fire(undefined);

        let value = prefService.get('test.boolean');
        expect(value).to.be.false;

        stubWorkspace.restore();
        mockUserPreferenceEmitter.fire(undefined);

        value = prefService.get('test.boolean');
        expect(value).to.be.true;

        stubUser.restore();
    });

    it('Should throw a TypeError if the preference (reference object) is modified', () => {
        const userProvider = testContainer.get(UserPreferenceProvider);
        const stubUser = sinon.stub(userProvider, 'getPreferences').returns({
            'test.immutable': [
                'test', 'test', 'test'
            ]
        });
        mockUserPreferenceEmitter.fire(undefined);

        const immutablePref: string[] | undefined = prefService.get('test.immutable');
        expect(immutablePref).to.not.be.undefined;
        if (immutablePref !== undefined) {
            expect(() => {
                immutablePref.push('fails');
            }).to.throw(TypeError);
        }
        stubUser.restore();
    });

    it('Should still report the more specific preference even though the less specific one changed', () => {
        const userProvider = testContainer.get(UserPreferenceProvider);
        const workspaceProvider = testContainer.get(WorkspacePreferenceProvider);
        let stubUser = sinon.stub(userProvider, 'getPreferences').returns({
            'test.boolean': true,
            'test.number': 1
        });
        const stubWorkspace = sinon.stub(workspaceProvider, 'getPreferences').returns({
            'test.boolean': false,
            'test.number': 0
        });
        mockUserPreferenceEmitter.fire(undefined);

        let value = prefService.get('test.number');
        expect(value).equals(0);
        stubUser.restore();

        stubUser = sinon.stub(userProvider, 'getPreferences').returns({
            'test.boolean': true,
            'test.number': 4
        });
        mockUserPreferenceEmitter.fire(undefined);

        value = prefService.get('test.number');
        expect(value).equals(0);

        [stubUser, stubWorkspace].forEach(stub => {
            stub.restore();
        });
    });
});
