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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core';
import {
    PreferenceChange,
    PreferenceChanges,
    PreferenceInspection,
    PreferenceService
} from '@theia/core/lib/common/preferences/preference-service';
import { PreferenceScope } from '@theia/core/lib/common/preferences/preference-scope';
import {
    PreferenceDataProperty,
    PreferenceSchemaService
} from '@theia/core/lib/common/preferences/preference-schema';
import { WorkspaceTrustService } from '@theia/workspace/lib/browser/workspace-trust-service';
import { AIPreferenceServiceImpl } from './ai-preference-service';

disableJSDOM();

interface MockInspection {
    defaultValue?: unknown;
    globalValue?: unknown;
    workspaceValue?: unknown;
    workspaceFolderValue?: unknown;
}

class MockPreferenceService {
    readonly inspections = new Map<string, MockInspection>();
    readonly onPreferenceChangedEmitter = new Emitter<PreferenceChange>();
    readonly onPreferencesChangedEmitter = new Emitter<PreferenceChanges>();
    readonly ready = Promise.resolve();
    readonly isReady = true;

    get onPreferenceChanged(): Emitter<PreferenceChange>['event'] {
        return this.onPreferenceChangedEmitter.event;
    }

    get onPreferencesChanged(): Emitter<PreferenceChanges>['event'] {
        return this.onPreferencesChangedEmitter.event;
    }

    overrides = new Map<string, string>();

    dispose(): void {
        this.onPreferenceChangedEmitter.dispose();
        this.onPreferencesChangedEmitter.dispose();
    }

    inspect(preferenceName: string): PreferenceInspection<any> | undefined {
        const mock = this.inspections.get(preferenceName);
        if (!mock) {
            return undefined;
        }
        const value = mock.workspaceFolderValue ?? mock.workspaceValue ?? mock.globalValue ?? mock.defaultValue;
        return {
            preferenceName,
            defaultValue: mock.defaultValue as any,
            globalValue: mock.globalValue as any,
            workspaceValue: mock.workspaceValue as any,
            workspaceFolderValue: mock.workspaceFolderValue as any,
            value: value as any
        };
    }

    inspectInScope(preferenceName: string, scope: PreferenceScope): any {
        const mock = this.inspections.get(preferenceName);
        if (!mock) {
            return undefined;
        }
        switch (scope) {
            case PreferenceScope.Default: return mock.defaultValue;
            case PreferenceScope.User: return mock.globalValue;
            case PreferenceScope.Workspace: return mock.workspaceValue;
            case PreferenceScope.Folder: return mock.workspaceFolderValue;
        }
    }

    get(preferenceName: string, defaultValue?: any): any {
        const inspection = this.inspect(preferenceName);
        return inspection?.value ?? defaultValue;
    }

    resolve(preferenceName: string, defaultValue?: any): { value?: any } {
        const inspection = this.inspect(preferenceName);
        if (inspection && inspection.value !== undefined) {
            return { value: inspection.value };
        }
        const overridden = this.overriddenPreferenceName(preferenceName);
        if (overridden) {
            const base = this.inspect(overridden.preferenceName);
            if (base && base.value !== undefined) {
                return { value: base.value };
            }
        }
        return { value: defaultValue };
    }

    async set(): Promise<void> { /* no-op */ }
    async updateValue(): Promise<void> { /* no-op */ }

    overridePreferenceName(): string { return ''; }
    overriddenPreferenceName(preferenceName: string): { preferenceName: string } | undefined {
        const base = this.overrides.get(preferenceName);
        return base ? { preferenceName: base } : undefined;
    }

    getConfigUri(): undefined { return undefined; }
}

class MockWorkspaceTrustService {
    trusted = true;
    readonly onDidChangeWorkspaceTrustEmitter = new Emitter<boolean>();
    get onDidChangeWorkspaceTrust(): Emitter<boolean>['event'] {
        return this.onDidChangeWorkspaceTrustEmitter.event;
    }
    async getWorkspaceTrust(): Promise<boolean> {
        return this.trusted;
    }
    setTrust(trusted: boolean): void {
        this.trusted = trusted;
        this.onDidChangeWorkspaceTrustEmitter.fire(trusted);
    }
}

class MockPreferenceSchemaService {
    readonly schemaProperties = new Map<string, PreferenceDataProperty>();
    getSchemaProperties(): ReadonlyMap<string, PreferenceDataProperty> {
        return this.schemaProperties;
    }
}

describe('AIPreferenceServiceImpl', () => {

    let container: Container;
    let mockPrefs: MockPreferenceService;
    let mockTrust: MockWorkspaceTrustService;
    let mockSchema: MockPreferenceSchemaService;
    let service: AIPreferenceServiceImpl;

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(async () => {
        container = new Container();
        mockPrefs = new MockPreferenceService();
        mockTrust = new MockWorkspaceTrustService();
        mockSchema = new MockPreferenceSchemaService();

        container.bind(PreferenceService).toConstantValue(mockPrefs as unknown as PreferenceService);
        container.bind(WorkspaceTrustService).toConstantValue(mockTrust as unknown as WorkspaceTrustService);
        container.bind(PreferenceSchemaService).toConstantValue(mockSchema as unknown as PreferenceSchemaService);
        container.bind(AIPreferenceServiceImpl).toSelf();

        service = container.get(AIPreferenceServiceImpl);
        // Wait for postConstruct to resolve the initial trust state
        await mockTrust.getWorkspaceTrust();
        await new Promise(resolve => setImmediate(resolve));
    });

    afterEach(() => {
        mockPrefs.dispose();
    });

    describe('get()', () => {
        it('returns delegate value when trusted', () => {
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'default',
                globalValue: 'user',
                workspaceValue: 'ws'
            });
            expect(service.get<string>('pref.a')).to.equal('ws');
        });

        it('hides workspace value when untrusted', () => {
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'default',
                globalValue: 'user',
                workspaceValue: 'ws'
            });
            mockTrust.setTrust(false);
            expect(service.get<string>('pref.a')).to.equal('user');
        });

        it('falls back to defaultValue when untrusted and no global/default', () => {
            mockPrefs.inspections.set('pref.a', {
                workspaceValue: 'ws'
            });
            mockTrust.setTrust(false);
            expect(service.get<string>('pref.a', 'fallback')).to.equal('fallback');
        });

        it('returns supplied default when preference unknown', () => {
            mockTrust.setTrust(false);
            expect(service.get<string>('pref.missing', 'fallback')).to.equal('fallback');
        });
    });

    describe('resolve()', () => {
        it('returns delegate resolve when trusted', () => {
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'd',
                globalValue: 'u',
                workspaceValue: 'ws'
            });
            expect(service.resolve<string>('pref.a').value).to.equal('ws');
        });

        it('hides workspace value when untrusted', () => {
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'd',
                globalValue: 'u',
                workspaceValue: 'ws'
            });
            mockTrust.setTrust(false);
            expect(service.resolve<string>('pref.a').value).to.equal('u');
        });

        it('falls back to base preference via language override when untrusted', () => {
            mockPrefs.overrides.set('[ts].pref.a', 'pref.a');
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'base-default'
            });
            // No inspection for override preference, so it should fall back to base
            mockTrust.setTrust(false);
            expect(service.resolve<string>('[ts].pref.a').value).to.equal('base-default');
        });
    });

    describe('inspect()', () => {
        it('returns unmodified inspection when trusted', () => {
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'd',
                globalValue: 'u',
                workspaceValue: 'ws',
                workspaceFolderValue: 'folder'
            });
            const inspection = service.inspect<any>('pref.a');
            expect(inspection?.workspaceValue).to.equal('ws');
            expect(inspection?.workspaceFolderValue).to.equal('folder');
            expect(inspection?.value).to.equal('folder');
        });

        it('strips workspace/folder values and recomputes value when untrusted', () => {
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'd',
                globalValue: 'u',
                workspaceValue: 'ws',
                workspaceFolderValue: 'folder'
            });
            mockTrust.setTrust(false);
            const inspection = service.inspect<any>('pref.a');
            expect(inspection?.workspaceValue).to.equal(undefined);
            expect(inspection?.workspaceFolderValue).to.equal(undefined);
            expect(inspection?.value).to.equal('u');
            expect(inspection?.globalValue).to.equal('u');
            expect(inspection?.defaultValue).to.equal('d');
        });

        it('falls back to defaultValue when untrusted and no globalValue', () => {
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'd',
                workspaceValue: 'ws'
            });
            mockTrust.setTrust(false);
            const inspection = service.inspect<any>('pref.a');
            expect(inspection?.value).to.equal('d');
        });
    });

    describe('inspectInScope()', () => {
        it('returns delegate value for Workspace when trusted', () => {
            mockPrefs.inspections.set('pref.a', { workspaceValue: 'ws' });
            expect(service.inspectInScope<any>('pref.a', PreferenceScope.Workspace)).to.equal('ws');
        });

        it('returns undefined for Workspace when untrusted', () => {
            mockPrefs.inspections.set('pref.a', { workspaceValue: 'ws' });
            mockTrust.setTrust(false);
            expect(service.inspectInScope<any>('pref.a', PreferenceScope.Workspace)).to.equal(undefined);
        });

        it('returns undefined for Folder when untrusted', () => {
            mockPrefs.inspections.set('pref.a', { workspaceFolderValue: 'folder' });
            mockTrust.setTrust(false);
            expect(service.inspectInScope<any>('pref.a', PreferenceScope.Folder)).to.equal(undefined);
        });

        it('still returns User value when untrusted', () => {
            mockPrefs.inspections.set('pref.a', { globalValue: 'user' });
            mockTrust.setTrust(false);
            expect(service.inspectInScope<any>('pref.a', PreferenceScope.User)).to.equal('user');
        });
    });

    describe('trust change events', () => {
        it('fires onPreferenceChanged and onPreferencesChanged when trust flips and a workspace-scoped pref is affected', () => {
            mockSchema.schemaProperties.set('pref.a', { type: 'string' });
            mockSchema.schemaProperties.set('pref.b', { type: 'string' });
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'd',
                globalValue: 'u',
                workspaceValue: 'ws'
            });
            mockPrefs.inspections.set('pref.b', {
                defaultValue: 'd',
                globalValue: 'u'
            });

            const singleEvents: PreferenceChange[] = [];
            const batchEvents: PreferenceChanges[] = [];
            service.onPreferenceChanged(e => singleEvents.push(e));
            service.onPreferencesChanged(e => batchEvents.push(e));

            mockTrust.setTrust(false);

            expect(singleEvents.length).to.equal(1);
            expect(singleEvents[0].preferenceName).to.equal('pref.a');
            expect(batchEvents.length).to.equal(1);
            expect(Object.keys(batchEvents[0])).to.deep.equal(['pref.a']);
        });

        it('does not fire synthetic events for prefs without workspace/folder values', () => {
            mockSchema.schemaProperties.set('pref.a', { type: 'string' });
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'd',
                globalValue: 'u'
            });

            const events: PreferenceChange[] = [];
            service.onPreferenceChanged(e => events.push(e));

            mockTrust.setTrust(false);

            expect(events.length).to.equal(0);
        });

        it('does not fire when setTrust is called with the same value', () => {
            mockSchema.schemaProperties.set('pref.a', { type: 'string' });
            mockPrefs.inspections.set('pref.a', {
                defaultValue: 'd',
                globalValue: 'u',
                workspaceValue: 'ws'
            });

            const events: PreferenceChange[] = [];
            service.onPreferenceChanged(e => events.push(e));

            // Already trusted, firing true again should have no effect
            mockTrust.setTrust(true);

            expect(events.length).to.equal(0);
        });

        it('forwards delegate events through the wrapper emitters', () => {
            const events: PreferenceChange[] = [];
            const batchEvents: PreferenceChanges[] = [];
            service.onPreferenceChanged(e => events.push(e));
            service.onPreferencesChanged(e => batchEvents.push(e));

            const change: PreferenceChange = {
                preferenceName: 'pref.x',
                scope: PreferenceScope.User,
                domain: undefined,
                affects: () => true
            };
            mockPrefs.onPreferenceChangedEmitter.fire(change);
            mockPrefs.onPreferencesChangedEmitter.fire({ 'pref.x': change });

            expect(events.length).to.equal(1);
            expect(events[0].preferenceName).to.equal('pref.x');
            expect(batchEvents.length).to.equal(1);
        });

        it('emits exactly one delegate event and one trust-synth event for distinct preferences', () => {
            mockSchema.schemaProperties.set('pref.trust', { type: 'string' });
            mockPrefs.inspections.set('pref.trust', {
                defaultValue: 'd',
                globalValue: 'u',
                workspaceValue: 'ws'
            });

            const events: PreferenceChange[] = [];
            service.onPreferenceChanged(e => events.push(e));

            // First, a delegate event for a different preference
            const delegateChange: PreferenceChange = {
                preferenceName: 'pref.other',
                scope: PreferenceScope.User,
                domain: undefined,
                affects: () => true
            };
            mockPrefs.onPreferenceChangedEmitter.fire(delegateChange);

            // Then, a trust flip that synthesizes an event for pref.trust
            mockTrust.setTrust(false);

            expect(events.length).to.equal(2);
            expect(events[0].preferenceName).to.equal('pref.other');
            expect(events[1].preferenceName).to.equal('pref.trust');
        });
    });
});
