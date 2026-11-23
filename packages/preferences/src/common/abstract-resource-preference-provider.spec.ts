// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/* eslint-disable @typescript-eslint/no-explicit-any */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container, injectable } from '@theia/core/shared/inversify';
import { AbstractResourcePreferenceProvider, FileContentStatus, PreferenceStorage, PreferenceStorageFactory } from './abstract-resource-preference-provider.js';
import { bindPreferenceService } from '@theia/core/lib/browser/frontend-application-bindings';
import { bindMockPreferenceProviders, MockPreferenceProvider } from '@theia/core/lib/browser/preferences/test';
import { Deferred } from '@theia/core/lib/common/promise-util';
import {
    Emitter, Event, Listener, MessageService, PreferenceExclusionContext, PreferenceExclusionPolicy, PreferenceExclusionService,
    PreferenceProvider, PreferenceSchemaService, PreferenceScope, PreferenceService, URI
} from '@theia/core/lib/common';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { WorkspaceTrustPreferenceExclusionPolicy } from '@theia/workspace/lib/browser/workspace-trust-preference-exclusion-policy';
import { EditorManager } from '@theia/editor/lib/browser';
import { PreferenceTransactionFactory } from '../browser/preference-transaction-manager.js';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';

disableJSDOM();

class MockPreferenceStorage implements PreferenceStorage {
    onDidChangeFileContent: Listener.Registration<FileContentStatus, Promise<boolean>> = Listener.None as unknown as Listener.Registration<FileContentStatus, Promise<boolean>>;
    writeValue(key: string, path: string[], value: JSONValue): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    disposed = false;
    dispose(): void {
        this.disposed = true;
    }
    releaseContent = new Deferred();
    async read(): Promise<string> {
        await this.releaseContent.promise;
        return JSON.stringify({ 'editor.fontSize': 20 });
    }
}
const mockSchemaProvider = { getSchemaProperty: () => undefined, onDidChangeSchema: Event.None };

class LessAbstractPreferenceProvider extends AbstractResourcePreferenceProvider {
    getUri(): URI { return new URI('file:///user/settings.json'); }
    getScope(): PreferenceScope { return PreferenceScope.User; }
}

describe('AbstractResourcePreferenceProvider', () => {
    let provider: AbstractResourcePreferenceProvider;
    let preferenceStorage: MockPreferenceStorage;

    beforeEach(() => {
        preferenceStorage = new MockPreferenceStorage();
        const testContainer = new Container();
        testContainer.bind(ILogger).to(MockLogger).inSingletonScope();
        bindPreferenceService(testContainer.bind.bind(testContainer));
        bindMockPreferenceProviders(testContainer.bind.bind(testContainer), testContainer.unbind.bind(testContainer));
        testContainer.rebind(<any>PreferenceSchemaService).toConstantValue(mockSchemaProvider);
        testContainer.bind(<any>PreferenceStorageFactory).toFactory(() => () => preferenceStorage);
        testContainer.bind(<any>MessageService).toConstantValue(undefined);
        testContainer.bind(<any>EditorManager).toConstantValue(undefined);
        testContainer.bind(<any>PreferenceTransactionFactory).toConstantValue(undefined);
        provider = testContainer.resolve(<any>LessAbstractPreferenceProvider);
    });

    it('should not store any preferences before it is ready.', async () => {
        const resolveWhenFinished = new Deferred();
        const errorIfReadyFirst = provider.ready.then(() => Promise.reject());

        expect(provider.get('editor.fontSize')).to.be.undefined;

        resolveWhenFinished.resolve();
        preferenceStorage.releaseContent.resolve(); // Allow the initialization to run

        // This promise would reject if the provider had declared itself ready before we resolve `resolveWhenFinished`
        await Promise.race([resolveWhenFinished.promise, errorIfReadyFirst]);
    });

    it('should report values in file when `ready` resolves.', async () => {
        preferenceStorage.releaseContent.resolve();
        await provider.ready;
        expect(provider.get('editor.fontSize')).to.equal(20); // The value provided by the mock FileService implementation.
    });

    it('disposes its preference storage when the provider is disposed', () => {
        expect(preferenceStorage.disposed).to.be.false;
        provider.dispose();
        expect(preferenceStorage.disposed).to.be.true;
    });
});

const RESTRICTED = 'test.restricted';
const OPEN = 'test.open';
const LATE = 'test.registeredLate';
const USER_RESTRICTED = 'test.restrictedInUserSettings';
const WORKSPACE_SETTINGS = new URI('file:///workspace/.theia/settings.json');

const USER_SETTINGS = new URI('file:///user/settings.json');

class SettingsStorage implements PreferenceStorage {
    protected listener: ((status: FileContentStatus) => Promise<boolean>) | undefined;
    onDidChangeFileContent: Listener.Registration<FileContentStatus, Promise<boolean>> = listener => {
        this.listener = listener;
        return { dispose: () => this.listener = undefined };
    };

    constructor(protected content: Record<string, JSONValue>) { }

    writeValue(): Promise<boolean> {
        throw new Error('Method not implemented.');
    }
    dispose(): void { }
    async read(): Promise<string> {
        return JSON.stringify(this.content);
    }

    /** As when the file changes on disk. */
    async change(content: Record<string, JSONValue>): Promise<void> {
        this.content = content;
        await this.listener?.({ content: JSON.stringify(content), fileOK: true });
    }
}

@injectable()
class WorkspaceSettingsProvider extends AbstractResourcePreferenceProvider {
    /** `FolderPreferenceProvider` reports the Workspace or the Folder scope, depending on the kind of workspace. */
    scope = PreferenceScope.Workspace;
    getUri(): URI { return WORKSPACE_SETTINGS; }
    getScope(): PreferenceScope { return this.scope; }
}

@injectable()
class UserSettingsProvider extends AbstractResourcePreferenceProvider {
    getUri(): URI { return USER_SETTINGS; }
    getScope(): PreferenceScope { return PreferenceScope.User; }
}

class RestrictedPolicy implements PreferenceExclusionPolicy {
    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange = this.onDidChangeEmitter.event;
    protected excluding = true;

    setExcluding(excluding: boolean): void {
        this.excluding = excluding;
        this.onDidChangeEmitter.fire();
    }

    isExcluded(preferenceName: string, { property, scope }: PreferenceExclusionContext): boolean {
        return this.excluding && !!property?.restricted && scope === PreferenceScope.Workspace;
    }
}

class StubWorkspaceTrustService implements Pick<WorkspaceTrustService, 'onDidChangeWorkspaceTrust' | 'currentWorkspaceTrust'> {
    protected readonly onDidChangeWorkspaceTrustEmitter = new Emitter<boolean>();
    readonly onDidChangeWorkspaceTrust = this.onDidChangeWorkspaceTrustEmitter.event;
    currentWorkspaceTrust: boolean | undefined;

    resolveTrust(trusted: boolean): void {
        this.currentWorkspaceTrust = trusted;
        this.onDidChangeWorkspaceTrustEmitter.fire(trusted);
    }

    /** As `WorkspaceTrustService` does when the workspace changes: no event until trust is resolved again. */
    resetTrust(): void {
        this.currentWorkspaceTrust = undefined;
    }
}

describe('AbstractResourcePreferenceProvider with exclusion policies', () => {
    let container: Container;
    let provider: WorkspaceSettingsProvider;
    let preferences: PreferenceService;
    let schemas: PreferenceSchemaService;
    let exclusions: PreferenceExclusionService;
    let workspaceStorage: SettingsStorage;
    let changes: string[];

    function createContainer(): void {
        container = new Container();
        container.bind(ILogger).to(MockLogger).inSingletonScope();
        bindPreferenceService(container.bind.bind(container));
        workspaceStorage = new SettingsStorage({ [RESTRICTED]: 'workspace', [OPEN]: 'workspace', [LATE]: 'workspace' });
        const userStorage = new SettingsStorage({ [USER_RESTRICTED]: 'user' });
        container.bind(PreferenceStorageFactory).toFactory(() => (uri: URI) => uri.isEqual(USER_SETTINGS) ? userStorage : workspaceStorage);
        container.bind(WorkspaceSettingsProvider).toSelf().inSingletonScope();
        container.bind(UserSettingsProvider).toSelf().inSingletonScope();
        container.bind(PreferenceProvider).toDynamicValue(ctx => ctx.container.get(UserSettingsProvider)).inSingletonScope().whenTargetNamed(PreferenceScope.User);
        container.bind(PreferenceProvider).toDynamicValue(ctx => ctx.container.get(WorkspaceSettingsProvider)).inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);
        const folderProvider = new MockPreferenceProvider(PreferenceScope.Folder);
        folderProvider.markReady();
        container.bind(PreferenceProvider).toConstantValue(folderProvider).whenTargetNamed(PreferenceScope.Folder);
    }

    async function start(): Promise<void> {
        schemas = container.get<PreferenceSchemaService>(PreferenceSchemaService);
        schemas.addSchema({
            properties: {
                [RESTRICTED]: { type: 'string', default: 'default', restricted: true, overridable: true },
                [USER_RESTRICTED]: { type: 'string', default: 'default', restricted: true },
                [OPEN]: { type: 'string', default: 'default' }
            }
        });
        schemas.registerOverrideIdentifier('typescript');
        schemas.registerOverrideIdentifier('dotted.language');
        preferences = container.get<PreferenceService>(PreferenceService);
        exclusions = container.get<PreferenceExclusionService>(PreferenceExclusionService);
        await preferences.ready;
        provider = container.get(WorkspaceSettingsProvider);
        await flushChanges();
        changes = [];
        preferences.onPreferenceChanged(change => changes.push(`${change.preferenceName}@${PreferenceScope[change.scope]}`));
    }

    /** Providers fire their change events debounced. */
    function flushChanges(): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, 10));
    }

    afterEach(() => container.get<PreferenceService>(PreferenceService).dispose());

    describe('a policy that excludes restricted preferences', () => {
        let policy: RestrictedPolicy;

        beforeEach(async () => {
            createContainer();
            policy = new RestrictedPolicy();
            container.bind(PreferenceExclusionPolicy).toConstantValue(policy);
            await start();
        });

        it('omits an excluded value from everything that reads the provider', () => {
            expect(provider.get(RESTRICTED)).to.be.undefined;
            expect(provider.getPreferences()).to.deep.equal({ [OPEN]: 'workspace', [LATE]: 'workspace' });
            expect(preferences.get(RESTRICTED)).to.equal('default');
            expect(preferences.inspect(RESTRICTED)?.workspaceValue).to.be.undefined;
            expect(preferences.get(OPEN)).to.equal('workspace');
        });

        it('applies the value and fires a change event once the policy no longer excludes it', async () => {
            policy.setExcluding(false);
            await flushChanges();

            expect(preferences.get(RESTRICTED)).to.equal('workspace');
            expect(changes).to.deep.equal([`${RESTRICTED}@Workspace`]);
        });

        it('drops the value and fires a change event once the policy excludes it again', async () => {
            policy.setExcluding(false);
            await flushChanges();
            changes.length = 0;

            policy.setExcluding(true);
            await flushChanges();

            expect(preferences.get(RESTRICTED)).to.equal('default');
            expect(changes).to.deep.equal([`${RESTRICTED}@Workspace`]);
        });

        it('excludes a value whose schema is registered after the file was read', async () => {
            expect(preferences.get(LATE)).to.equal('workspace');

            schemas.addSchema({ defaultRestricted: true, properties: { [LATE]: { type: 'string', default: 'default' } } });
            await flushChanges();

            expect(preferences.get(LATE)).to.equal('default');
            expect(changes).to.include(`${LATE}@Workspace`);
        });

        it('reports the values it omits', async () => {
            const excluded = { preferenceName: RESTRICTED, overrideIdentifier: undefined, scope: PreferenceScope.Workspace, configUri: WORKSPACE_SETTINGS };
            expect(exclusions.getExcludedPreferences()).to.deep.equal([excluded]);
            expect(exclusions.getExcludedPreferences(PreferenceScope.Folder)).to.be.empty;
            let fired = 0;
            exclusions.onDidChangeExcludedPreferences(() => fired++);

            policy.setExcluding(false);

            expect(exclusions.getExcludedPreferences()).to.be.empty;
            expect(fired).to.equal(1);
        });

        it('stops reporting the values it omitted once it is disposed, also when the file changes afterwards', async () => {
            provider.dispose();

            expect(exclusions.getExcludedPreferences()).to.be.empty;

            await workspaceStorage.change({ [RESTRICTED]: 'changed' });

            expect(exclusions.getExcludedPreferences()).to.be.empty;
        });

        it('applies the policy to the new content when the file changes', async () => {
            await workspaceStorage.change({ [RESTRICTED]: 'changed', [OPEN]: 'changed' });
            await flushChanges();

            expect(preferences.get(RESTRICTED)).to.equal('default');
            expect(preferences.get(OPEN)).to.equal('changed');
            expect(changes).to.have.members([`${OPEN}@Workspace`, `${LATE}@Workspace`]);

            policy.setExcluding(false);

            expect(preferences.get(RESTRICTED)).to.equal('changed');
        });

        it('omits the language overrides of an excluded preference, also for a language id with a dot', async () => {
            await workspaceStorage.change({
                '[typescript]': { [RESTRICTED]: 'typescript', [OPEN]: 'typescript' },
                '[dotted.language]': { [RESTRICTED]: 'dotted' }
            });

            expect(provider.getPreferences()).to.deep.equal({ [`[typescript].${OPEN}`]: 'typescript' });
            expect(preferences.get(RESTRICTED, { override: 'typescript' })).to.equal('default');
            expect(preferences.get(RESTRICTED, { override: 'dotted.language' })).to.equal('default');
            expect(exclusions.getExcludedPreferences().map(excluded => excluded.overrideIdentifier)).to.deep.equal(['typescript', 'dotted.language']);

            policy.setExcluding(false);

            expect(preferences.get(RESTRICTED, { override: 'typescript' })).to.equal('typescript');
            expect(preferences.get(RESTRICTED, { override: 'dotted.language' })).to.equal('dotted');
        });

        it('never omits a session value', async () => {
            await preferences.set(RESTRICTED, 'session', PreferenceScope.Session);

            expect(preferences.get(RESTRICTED)).to.equal('session');
        });
    });

    describe('the workspace trust policy', () => {
        let trust: StubWorkspaceTrustService;

        beforeEach(async () => {
            createContainer();
            trust = new StubWorkspaceTrustService();
            container.bind<Pick<WorkspaceTrustService, 'onDidChangeWorkspaceTrust' | 'currentWorkspaceTrust'>>(WorkspaceTrustService).toConstantValue(trust);
            container.bind(WorkspaceTrustPreferenceExclusionPolicy).toSelf().inSingletonScope();
            container.bind(PreferenceExclusionPolicy).toService(WorkspaceTrustPreferenceExclusionPolicy);
            await start();
        });

        it('omits restricted workspace values while the trust state is unknown', () => {
            expect(preferences.get(RESTRICTED)).to.equal('default');
            expect(preferences.get(OPEN)).to.equal('workspace');
        });

        it('keeps omitting them in an untrusted workspace', async () => {
            trust.resolveTrust(false);
            await flushChanges();

            expect(preferences.get(RESTRICTED)).to.equal('default');
            expect(changes).to.be.empty;
        });

        it('applies them with a change event once the workspace is trusted, and omits them again when trust is revoked', async () => {
            trust.resolveTrust(true);
            await flushChanges();

            expect(preferences.get(RESTRICTED)).to.equal('workspace');
            expect(changes).to.deep.equal([`${RESTRICTED}@Workspace`]);

            trust.resolveTrust(false);
            await flushChanges();

            expect(preferences.get(RESTRICTED)).to.equal('default');
            expect(changes).to.deep.equal([`${RESTRICTED}@Workspace`, `${RESTRICTED}@Workspace`]);
        });

        it('omits what it reads while trust is resolved again after a workspace change', async () => {
            trust.resolveTrust(true);
            trust.resetTrust();
            await workspaceStorage.change({ [RESTRICTED]: 'changed' });

            expect(preferences.get(RESTRICTED)).to.equal('default');

            trust.resolveTrust(true);

            expect(preferences.get(RESTRICTED)).to.equal('changed');
        });

        it('reports the scope the provider has when the policies are applied again', () => {
            expect(exclusions.getExcludedPreferences(PreferenceScope.Workspace)).to.have.lengthOf(1);

            provider.scope = PreferenceScope.Folder;
            trust.resolveTrust(false);

            expect(exclusions.getExcludedPreferences(PreferenceScope.Workspace)).to.be.empty;
            expect(exclusions.getExcludedPreferences(PreferenceScope.Folder)).to.have.lengthOf(1);
        });

        it('never omits a restricted value of the user settings', () => {
            expect(preferences.get(USER_RESTRICTED)).to.equal('user');

            trust.resolveTrust(false);

            expect(preferences.get(USER_RESTRICTED)).to.equal('user');
        });

        it('never omits a session value', async () => {
            trust.resolveTrust(false);
            await preferences.set(RESTRICTED, 'session', PreferenceScope.Session);

            expect(preferences.get(RESTRICTED)).to.equal('session');
        });
    });
});
