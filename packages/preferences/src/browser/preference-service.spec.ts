/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable:no-unused-expression

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { Container } from 'inversify';
import * as chai from 'chai';
import * as fs from 'fs-extra';
import * as temp from 'temp';
import { Emitter } from '@theia/core/lib/common';
import {
    PreferenceService, PreferenceScope,
    PreferenceProviders, PreferenceServiceImpl, PreferenceProvider
} from '@theia/core/lib/browser/preferences';
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
import { WorkspacePreferences, createWorkspacePreferences } from '@theia/workspace/lib/browser/workspace-preferences';
import * as sinon from 'sinon';
import URI from "@theia/core/lib/common/uri";

disableJSDOM();

const expect = chai.expect;
let testContainer: Container;

let prefService: PreferenceService;
const tempPath = temp.track().openSync().path;

const mockUserPreferenceEmitter = new Emitter<void>();
const mockWorkspacePreferenceEmitter = new Emitter<void>();

before(async () => {
    testContainer = new Container();

    testContainer.bind(UserPreferenceProvider).toSelf().inSingletonScope();
    testContainer.bind(WorkspacePreferenceProvider).toSelf().inSingletonScope();

    testContainer.bind(PreferenceProviders).toFactory(ctx => (scope: PreferenceScope) => {
        const userProvider = ctx.container.get(UserPreferenceProvider);
        const workspaceProvider = ctx.container.get(WorkspacePreferenceProvider);

        sinon.stub(userProvider, 'onDidPreferencesChanged').get(() =>
            mockUserPreferenceEmitter.event
        );
        sinon.stub(workspaceProvider, 'onDidPreferencesChanged').get(() =>
            mockWorkspacePreferenceEmitter.event
        );
        return scope === PreferenceScope.User ? userProvider : workspaceProvider;
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
    testContainer.bind(WorkspacePreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createWorkspacePreferences(preferences);
    }).inSingletonScope();

    /* Window mocks and bindings*/
    testContainer.bind(WindowService).to(MockWindowService);

    /* Resource mocks and bindings */
    testContainer.bind(MockResourceProvider).toDynamicValue(ctx => {
        const resourceProvider = new MockResourceProvider();
        sinon.stub(resourceProvider, 'get').callsFake(() => Promise.resolve({
            uri: new URI(''),
            dispose() { },
            readContents(): Promise<string> {
                return fs.readFile(tempPath, 'utf-8');
            },
            saveContents(content: string, options?: { encoding?: string }): Promise<void> {
                return fs.writeFile(tempPath, content);
            }
        }));
        return resourceProvider;
    });
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

    it('Should store preference when settings file is empty', async () => {
        const settings = "{\n   \"key\": \"value\"\n}";
        await prefService.set("key", "value", PreferenceScope.User);
        expect(fs.readFileSync(tempPath).toString()).equals(settings);
    });

    it('Should store preference when settings file is not empty', async () => {
        const settings = "{\n   \"key\": \"value\",\n   \"newKey\": \"newValue\"\n}";
        fs.writeFileSync(tempPath, "{\n   \"key\": \"value\"\n}");
        await prefService.set("newKey", "newValue", PreferenceScope.User);
        expect(fs.readFileSync(tempPath).toString()).equals(settings);
    });

    it('Should override existing preference', async () => {
        const settings = "{\n   \"key\": \"newValue\"\n}";
        fs.writeFileSync(tempPath, "{\n   \"key\": \"oldValue\"\n}");
        await prefService.set("key", "newValue", PreferenceScope.User);
        expect(fs.readFileSync(tempPath).toString()).equals(settings);
    });

    /**
     * Make sure that the preference service is ready only once the providers
     * are ready to provide preferences.
     */
    it('Should be ready only when all providers are ready', async () => {
        /**
         * A slow provider that becomes ready after 1 second.
         */
        class SlowProvider extends PreferenceProvider {
            readonly prefs: { [p: string]: any } = {};

            constructor() {
                super();
                setTimeout(() => {
                    this.prefs['mypref'] = 2;
                    this._ready.resolve();
                }, 1000);
            }

            getPreferences() {
                return this.prefs;
            }
        }

        const container = new Container();
        container.bind(PreferenceProviders).toFactory(ctx => (scope: PreferenceScope) => new SlowProvider());
        container.bind(PreferenceServiceImpl).toSelf().inSingletonScope();

        const service = container.get<PreferenceServiceImpl>(PreferenceServiceImpl);
        await service.ready;
        const n = service.getNumber('mypref');
        expect(n).to.equal(2);
    });
});
