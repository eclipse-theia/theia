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
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { TrustAwarePreferenceReader } from './trust-aware-preference-reader';

disableJSDOM();

interface InspectResult<T> {
    defaultValue?: T;
    globalValue?: T;
    workspaceValue?: T;
    workspaceFolderValue?: T;
}

class StubPreferenceService {
    inspectResult: InspectResult<unknown> | undefined;
    effectiveValue: unknown;

    get<T>(_preferenceName: string, fallback?: T, _resourceUri?: string): T | undefined {
        return ((this.effectiveValue as T | undefined) ?? fallback);
    }

    inspect<T>(_preferenceName: string, _resourceUri?: string): InspectResult<T> | undefined {
        return this.inspectResult as InspectResult<T> | undefined;
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
        it('returns only user/default/fallback before ready resolves', () => {
            preferences.effectiveValue = 'workspace';
            preferences.inspectResult = {
                defaultValue: 'default',
                globalValue: 'user',
                workspaceValue: 'workspace'
            };
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('user');
        });

        it('returns defaultValue when only workspace value exists before ready', () => {
            preferences.effectiveValue = 'workspace';
            preferences.inspectResult = {
                defaultValue: 'default',
                workspaceValue: 'workspace'
            };
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('default');
        });

        it('returns fallback when nothing is set before ready', () => {
            preferences.effectiveValue = undefined;
            preferences.inspectResult = {};
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
            preferences.effectiveValue = 'workspace';
            preferences.inspectResult = {
                defaultValue: 'default',
                globalValue: 'user',
                workspaceValue: 'workspace'
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
            preferences.effectiveValue = 'workspace';
            preferences.inspectResult = {
                defaultValue: 'default',
                globalValue: 'user',
                workspaceValue: 'workspace'
            };
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('user');
        });

        it('falls back to defaultValue when only workspace value exists', () => {
            preferences.effectiveValue = 'workspace';
            preferences.inspectResult = {
                defaultValue: 'default',
                workspaceValue: 'workspace'
            };
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('default');
        });

        it('returns the supplied fallback when nothing is set', () => {
            preferences.effectiveValue = undefined;
            preferences.inspectResult = {};
            const value = reader.get<string>(PREFERENCE_NAME, 'fallback');
            expect(value).to.equal('fallback');
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
            preferences.effectiveValue = 'workspace';
            preferences.inspectResult = {
                defaultValue: 'default',
                globalValue: 'user',
                workspaceValue: 'workspace'
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

            preferences.effectiveValue = 'workspace';
            preferences.inspectResult = {
                defaultValue: 'default',
                globalValue: 'user',
                workspaceValue: 'workspace'
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

            preferences.effectiveValue = 'workspace';
            preferences.inspectResult = {
                defaultValue: 'default',
                globalValue: 'user',
                workspaceValue: 'workspace'
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

            preferences.effectiveValue = 'workspace';
            preferences.inspectResult = {
                defaultValue: 'default',
                globalValue: 'user',
                workspaceValue: 'workspace'
            };

            // Cached trust must reflect the change event (true).
            expect(reader.get<string>(PREFERENCE_NAME, 'fallback')).to.equal('workspace');
            // No change event should have been fired for the initial value.
            expect(received).to.deep.equal([]);
        });
    });
});
