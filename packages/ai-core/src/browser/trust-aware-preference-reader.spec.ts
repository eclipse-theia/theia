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
import { PreferenceResolveOptions, PreferenceScope, PreferenceService } from '@theia/core/lib/common/preferences';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { TrustAwarePreferenceReader } from './trust-aware-preference-reader';

disableJSDOM();

/** Highest precedence first, as `PreferenceService` resolves them. */
const SCOPES_BY_PRECEDENCE = [PreferenceScope.Session, PreferenceScope.Folder, PreferenceScope.Workspace, PreferenceScope.User, PreferenceScope.Default];

class StubPreferenceService {
    scopeValues: Partial<Record<PreferenceScope, unknown>> = {};
    readonly getOptions: (PreferenceResolveOptions | undefined)[] = [];

    get<T>(_preferenceName: string, fallback?: T, _resourceUri?: string, options?: PreferenceResolveOptions): T | undefined {
        this.getOptions.push(options);
        const scope = SCOPES_BY_PRECEDENCE.find(candidate => !options?.excludeScopes?.includes(candidate) && this.scopeValues[candidate] !== undefined);
        return scope === undefined ? fallback : this.scopeValues[scope] as T;
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

const PREFERENCE_NAME = 'some.preference';

describe('TrustAwarePreferenceReader', () => {
    let preferences: StubPreferenceService;
    let trust: StubWorkspaceTrustService;
    let reader: TrustAwarePreferenceReader;

    beforeEach(() => {
        preferences = new StubPreferenceService();
        trust = new StubWorkspaceTrustService();

        const container = new Container();
        container.bind(PreferenceService).toConstantValue(preferences as unknown as PreferenceService);
        container.bind(WorkspaceTrustService).toConstantValue(trust as unknown as WorkspaceTrustService);
        container.bind(TrustAwarePreferenceReader).toSelf().inSingletonScope();

        reader = container.get(TrustAwarePreferenceReader);
    });

    describe('fail-closed default', () => {
        it('leaves out the workspace value before ready resolves', () => {
            preferences.scopeValues = {
                [PreferenceScope.Default]: 'default',
                [PreferenceScope.User]: 'user',
                [PreferenceScope.Workspace]: 'workspace'
            };
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('user');
        });

        it('returns defaultValue when only workspace value exists before ready', () => {
            preferences.scopeValues = {
                [PreferenceScope.Default]: 'default',
                [PreferenceScope.Workspace]: 'workspace'
            };
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('default');
        });

        it('returns fallback when nothing is set before ready', () => {
            preferences.scopeValues = {};
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('fallback');
        });
    });

    describe('after ready resolves with trusted = true', () => {
        beforeEach(async () => {
            trust.trustDeferred.resolve(true);
            await reader.ready;
        });

        it('delegates to preferences.get and returns the workspace value', () => {
            preferences.scopeValues = {
                [PreferenceScope.Default]: 'default',
                [PreferenceScope.User]: 'user',
                [PreferenceScope.Workspace]: 'workspace'
            };
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('workspace');
        });
    });

    describe('after ready resolves with trusted = false', () => {
        beforeEach(async () => {
            trust.trustDeferred.resolve(false);
            await reader.ready;
        });

        it('returns globalValue when both global and workspace values exist', () => {
            preferences.scopeValues = {
                [PreferenceScope.Default]: 'default',
                [PreferenceScope.User]: 'user',
                [PreferenceScope.Workspace]: 'workspace'
            };
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('user');
        });

        it('falls back to defaultValue when only workspace value exists', () => {
            preferences.scopeValues = {
                [PreferenceScope.Default]: 'default',
                [PreferenceScope.Workspace]: 'workspace'
            };
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('default');
        });

        it('returns the supplied fallback when nothing is set', () => {
            preferences.scopeValues = {};
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('fallback');
        });
    });

    describe('scopes', () => {
        it('leaves out only the workspace and folder scopes while untrusted', async () => {
            reader.get(PREFERENCE_NAME);
            trust.trustDeferred.resolve(false);
            await reader.ready;
            reader.get(PREFERENCE_NAME);

            expect(preferences.getOptions).to.deep.equal([
                { excludeScopes: [PreferenceScope.Workspace, PreferenceScope.Folder] },
                { excludeScopes: [PreferenceScope.Workspace, PreferenceScope.Folder] }
            ]);
        });

        it('passes no filter when trusted', async () => {
            trust.trustDeferred.resolve(true);
            await reader.ready;
            reader.get(PREFERENCE_NAME);

            expect(preferences.getOptions).to.deep.equal([undefined]);
        });

        it('applies a session value while untrusted', async () => {
            trust.trustDeferred.resolve(false);
            await reader.ready;
            preferences.scopeValues = {
                [PreferenceScope.User]: 'user',
                [PreferenceScope.Workspace]: 'workspace',
                [PreferenceScope.Session]: 'session'
            };

            expect(reader.get<string>(PREFERENCE_NAME, 'fallback')).to.equal('session');
        });
    });

    describe('suppressUntrusted', () => {
        const inspection = {
            preferenceName: PREFERENCE_NAME,
            defaultValue: 'default',
            globalValue: 'user',
            workspaceValue: 'workspace',
            workspaceFolderValue: 'folder',
            value: 'folder'
        };

        it('clears the workspace and folder values when untrusted', async () => {
            trust.trustDeferred.resolve(false);
            await reader.ready;
            const result = reader.suppressUntrusted({ ...inspection });
            expect(result.workspaceValue).to.equal(undefined);
            expect(result.workspaceFolderValue).to.equal(undefined);
            expect(result.globalValue).to.equal('user');
            expect(result.defaultValue).to.equal('default');
        });

        it('returns the inspection unchanged when trusted', async () => {
            trust.trustDeferred.resolve(true);
            await reader.ready;
            const result = reader.suppressUntrusted({ ...inspection });
            expect(result.workspaceValue).to.equal('workspace');
            expect(result.workspaceFolderValue).to.equal('folder');
        });
    });

    describe('onDidChangeTrust', () => {
        beforeEach(async () => {
            trust.trustDeferred.resolve(false);
            await reader.ready;
        });

        it('fires with the new value when the underlying service emits a change', () => {
            const received: boolean[] = [];
            reader.onDidChangeTrust(value => received.push(value));

            trust.fireTrustChange(true);
            expect(received).to.deep.equal([true]);
        });

        it('does not fire when the value is unchanged', () => {
            const received: boolean[] = [];
            reader.onDidChangeTrust(value => received.push(value));

            trust.fireTrustChange(false);
            expect(received).to.deep.equal([]);
        });

        it('has updated the cached trusted flag by the time listeners run', () => {
            preferences.scopeValues = {
                [PreferenceScope.Default]: 'default',
                [PreferenceScope.User]: 'user',
                [PreferenceScope.Workspace]: 'workspace'
            };

            let observedDuringListener: string | undefined;
            reader.onDidChangeTrust(() => {
                observedDuringListener = reader.get<string>(PREFERENCE_NAME, 'fallback');
            });

            trust.fireTrustChange(true);
            expect(observedDuringListener).to.equal('workspace');
        });
    });

    describe('ready', () => {
        it('does not resolve until the initial getWorkspaceTrust promise resolves', async () => {
            let resolved = false;
            reader.ready.then(() => { resolved = true; });

            // Allow microtasks to settle without resolving the deferred.
            await Promise.resolve();
            expect(resolved).to.equal(false);

            trust.trustDeferred.resolve(true);
            await reader.ready;
            expect(resolved).to.equal(true);
        });

        it('resolves via an early change event when it arrives before the initial promise', async () => {
            const received: boolean[] = [];
            reader.onDidChangeTrust(value => received.push(value));

            trust.fireTrustChange(true);
            await reader.ready;

            // The first signal acts as the initial resolution and must not
            // be reported as a change event.
            expect(received).to.deep.equal([]);

            preferences.scopeValues = {
                [PreferenceScope.Default]: 'default',
                [PreferenceScope.User]: 'user',
                [PreferenceScope.Workspace]: 'workspace'
            };
            expect(reader.get<string>(PREFERENCE_NAME, 'fallback')).to.equal('workspace');
        });
    });

    describe('race between initial promise and change event', () => {
        it('ignores a stale getWorkspaceTrust resolution after a change event has initialised the reader', async () => {
            const received: boolean[] = [];
            reader.onDidChangeTrust(value => received.push(value));

            // Change event arrives first and initialises the reader.
            trust.fireTrustChange(false);
            // The (now stale) initial promise resolves to a different value.
            trust.trustDeferred.resolve(true);

            await reader.ready;
            // Allow the stale .then callback to run.
            await Promise.resolve();
            await Promise.resolve();

            preferences.scopeValues = {
                [PreferenceScope.Default]: 'default',
                [PreferenceScope.User]: 'user',
                [PreferenceScope.Workspace]: 'workspace'
            };

            // Cached trust must still reflect the change event (false), not
            // the stale promise resolution (true).
            expect(reader.get<string>(PREFERENCE_NAME, 'fallback')).to.equal('user');
            // No change event should have been fired for the initial value
            // and none for the stale resolution either.
            expect(received).to.deep.equal([]);
        });

        it('ignores a stale getWorkspaceTrust rejection after a change event has initialised the reader', async () => {
            const received: boolean[] = [];
            reader.onDidChangeTrust(value => received.push(value));

            // Avoid an unhandled rejection warning for the (now stale) initial promise.
            trust.getWorkspaceTrust().catch(() => { /* expected */ });

            // Change event arrives first and initialises the reader.
            trust.fireTrustChange(true);
            // The (now stale) initial promise rejects.
            trust.trustDeferred.reject(new Error('stale failure'));

            // ready must resolve (not reject) because the event already initialised it.
            await reader.ready;
            // Allow the stale rejection callback to run.
            await Promise.resolve();
            await Promise.resolve();

            preferences.scopeValues = {
                [PreferenceScope.Default]: 'default',
                [PreferenceScope.User]: 'user',
                [PreferenceScope.Workspace]: 'workspace'
            };

            // Cached trust must reflect the change event (true).
            expect(reader.get<string>(PREFERENCE_NAME, 'fallback')).to.equal('workspace');
            // No change event should have been fired for the initial value.
            expect(received).to.deep.equal([]);
        });
    });
});
