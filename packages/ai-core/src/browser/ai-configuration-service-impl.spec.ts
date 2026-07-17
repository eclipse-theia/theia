// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PreferenceChange, PreferenceInspection, PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { TrustAwarePreferenceReader } from './trust-aware-preference-reader';
import { AiConfigurationChange } from '../common/ai-configuration-service';
import { AiConfigurationServiceImpl } from './ai-configuration-service-impl';

disableJSDOM();

const KEY = 'ai-features.someKey';

/**
 * Minimal in-memory `PreferenceService` stub that stores values per scope and derives the
 * effective value with the same precedence as the real service.
 */
class StubPreferenceService {
    readonly ready = Promise.resolve();
    readonly isReady = true;

    protected readonly values = new Map<string, Map<PreferenceScope, unknown>>();

    protected readonly onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    readonly onPreferenceChanged: Event<PreferenceChange> = this.onPreferenceChangedEmitter.event;

    protected scopeMap(key: string): Map<PreferenceScope, unknown> {
        let map = this.values.get(key);
        if (!map) {
            map = new Map();
            this.values.set(key, map);
        }
        return map;
    }

    setScopeValue(key: string, scope: PreferenceScope, value: unknown): void {
        this.scopeMap(key).set(scope, value);
    }

    get<T>(preferenceName: string, defaultValue?: T): T | undefined {
        const inspection = this.inspect<T>(preferenceName);
        return (inspection?.value as T | undefined) ?? defaultValue;
    }

    set(preferenceName: string, value: unknown, scope: PreferenceScope = PreferenceScope.User): Promise<void> {
        this.scopeMap(preferenceName).set(scope, value);
        this.fire(preferenceName, scope);
        return Promise.resolve();
    }

    updateValue(preferenceName: string, value: unknown): Promise<void> {
        return this.set(preferenceName, value, PreferenceScope.User);
    }

    inspect<T>(preferenceName: string): PreferenceInspection<T> | undefined {
        const map = this.values.get(preferenceName);
        const defaultValue = map?.get(PreferenceScope.Default) as T | undefined;
        const globalValue = map?.get(PreferenceScope.User) as T | undefined;
        const workspaceValue = map?.get(PreferenceScope.Workspace) as T | undefined;
        const workspaceFolderValue = map?.get(PreferenceScope.Folder) as T | undefined;
        const value = workspaceFolderValue ?? workspaceValue ?? globalValue ?? defaultValue;
        return { preferenceName, defaultValue, globalValue, workspaceValue, workspaceFolderValue, value };
    }

    protected fire(preferenceName: string, scope: PreferenceScope): void {
        this.onPreferenceChangedEmitter.fire({
            preferenceName,
            scope,
            domain: undefined,
            affects: () => true
        } as unknown as PreferenceChange);
    }
}

class StubWorkspaceTrustService {
    readonly trustDeferred = new Deferred<boolean>();
    protected readonly emitter = new Emitter<boolean>();
    readonly onDidChangeWorkspaceTrust: Event<boolean> = this.emitter.event;

    getWorkspaceTrust(): Promise<boolean> {
        return this.trustDeferred.promise;
    }

    fireTrustChange(trusted: boolean): void {
        this.emitter.fire(trusted);
    }
}

describe('AiConfigurationServiceImpl', () => {
    let preferences: StubPreferenceService;
    let trust: StubWorkspaceTrustService;
    let service: AiConfigurationServiceImpl;

    const createService = async (trusted: boolean): Promise<void> => {
        preferences = new StubPreferenceService();
        trust = new StubWorkspaceTrustService();

        const container = new Container();
        container.bind(PreferenceService).toConstantValue(preferences as unknown as PreferenceService);
        container.bind(WorkspaceTrustService).toConstantValue(trust as unknown as WorkspaceTrustService);
        container.bind(TrustAwarePreferenceReader).toSelf().inSingletonScope();
        container.bind(AiConfigurationServiceImpl).toSelf().inSingletonScope();

        service = container.get(AiConfigurationServiceImpl);
        trust.trustDeferred.resolve(trusted);
        await service.ready;
    };

    describe('acceptance scenario', () => {
        beforeEach(() => createService(true));

        it('writes at User scope, reads back, reports User as source scope, and fires onDidChange', async () => {
            const changes: AiConfigurationChange[] = [];
            service.onDidChange(change => changes.push(change));

            await service.set(KEY, true, PreferenceScope.User);

            expect(service.get<boolean>(KEY)).to.equal(true);
            expect(service.inspect(KEY)?.sourceScope).to.equal(PreferenceScope.User);
            expect(changes.some(change => change.preferenceName === KEY)).to.equal(true);
        });
    });

    describe('inspect source-scope derivation (trusted)', () => {
        beforeEach(() => createService(true));

        it('reports undefined source scope when only the default applies', () => {
            preferences.setScopeValue(KEY, PreferenceScope.Default, 'default');
            const inspection = service.inspect<string>(KEY);
            expect(inspection?.sourceScope).to.equal(undefined);
            expect(inspection?.value).to.equal('default');
        });

        it('reports User when a user value is set', () => {
            preferences.setScopeValue(KEY, PreferenceScope.Default, 'default');
            preferences.setScopeValue(KEY, PreferenceScope.User, 'user');
            const inspection = service.inspect<string>(KEY);
            expect(inspection?.sourceScope).to.equal(PreferenceScope.User);
            expect(inspection?.value).to.equal('user');
        });

        it('reports Workspace when a workspace value wins', () => {
            preferences.setScopeValue(KEY, PreferenceScope.User, 'user');
            preferences.setScopeValue(KEY, PreferenceScope.Workspace, 'workspace');
            const inspection = service.inspect<string>(KEY);
            expect(inspection?.sourceScope).to.equal(PreferenceScope.Workspace);
            expect(inspection?.value).to.equal('workspace');
        });
    });

    describe('trust-aware reads', () => {
        it('ignores the workspace value when untrusted', async () => {
            await createService(false);
            preferences.setScopeValue(KEY, PreferenceScope.Default, 'default');
            preferences.setScopeValue(KEY, PreferenceScope.User, 'user');
            preferences.setScopeValue(KEY, PreferenceScope.Workspace, 'workspace');

            expect(service.get<string>(KEY)).to.equal('user');
            const inspection = service.inspect<string>(KEY);
            expect(inspection?.value).to.equal('user');
            expect(inspection?.sourceScope).to.equal(PreferenceScope.User);
            // The suppressed workspace/folder values are cleared, not just excluded from `value`.
            expect(inspection?.workspaceValue).to.equal(undefined);
            expect(inspection?.workspaceFolderValue).to.equal(undefined);
        });

        it('honors the workspace value when trusted', async () => {
            await createService(true);
            preferences.setScopeValue(KEY, PreferenceScope.User, 'user');
            preferences.setScopeValue(KEY, PreferenceScope.Workspace, 'workspace');

            expect(service.get<string>(KEY)).to.equal('workspace');
            expect(service.inspect<string>(KEY)?.value).to.equal('workspace');
        });

        it('fires onDidChange (without a preference name) on a trust transition', async () => {
            await createService(false);
            const changes: AiConfigurationChange[] = [];
            service.onDidChange(change => changes.push(change));

            trust.fireTrustChange(true);

            expect(changes).to.have.lengthOf(1);
            expect(changes[0].preferenceName).to.equal(undefined);
            expect(changes[0].affects()).to.equal(true);
            // A trust transition affects every trust-gated (ai-features.*) key, but not unrelated ones.
            expect(changes[0].affectsPreference(KEY)).to.equal(true);
            expect(changes[0].affectsPreference('ai-features.anythingElse')).to.equal(true);
            expect(changes[0].affectsPreference('editor.fontSize')).to.equal(false);
        });
    });

    describe('set vs update', () => {
        beforeEach(() => createService(true));

        it('set writes the exact scope requested', async () => {
            await service.set(KEY, 'workspace', PreferenceScope.Workspace);
            expect(preferences.inspect<string>(KEY)?.workspaceValue).to.equal('workspace');
            expect(preferences.inspect<string>(KEY)?.globalValue).to.equal(undefined);
        });

        it('update maps to updateValue (User scope)', async () => {
            await service.update(KEY, 'user');
            expect(preferences.inspect<string>(KEY)?.globalValue).to.equal('user');
        });
    });

    describe('onDidChange filtering', () => {
        beforeEach(() => createService(true));

        it('only fires for ai-features.* keys', async () => {
            const changes: AiConfigurationChange[] = [];
            service.onDidChange(change => changes.push(change));

            await service.set('editor.fontSize', 12, PreferenceScope.User);
            await service.set(KEY, true, PreferenceScope.User);

            expect(changes.map(change => change.preferenceName)).to.deep.equal([KEY]);
        });

        it('affectsPreference matches the changed key on a keyed change, not unrelated keys', async () => {
            const changes: AiConfigurationChange[] = [];
            service.onDidChange(change => changes.push(change));

            await service.set(KEY, true, PreferenceScope.User);

            expect(changes).to.have.lengthOf(1);
            expect(changes[0].affectsPreference(KEY)).to.equal(true);
            expect(changes[0].affectsPreference('ai-features.other')).to.equal(false);
        });
    });
});
