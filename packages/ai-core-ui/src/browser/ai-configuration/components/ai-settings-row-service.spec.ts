// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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
let disableJSDOM = enableJSDOM();

import { CommandService, PreferenceInspection, PreferenceScope } from '@theia/core/lib/common';
import { PreferenceDataProperty, PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { PreferencesCommands } from '@theia/preferences/lib/browser/util/preference-types';
import { AiConfigurationService } from '@theia/ai-core/lib/common/ai-configuration-service';
import { expect } from 'chai';
import { AiSettingsRowService } from './ai-settings-row-service';

disableJSDOM();

interface RecordedSet {
    preferenceId: string;
    value: unknown;
    scope: PreferenceScope | undefined;
    resourceUri: string | undefined;
}

class FakeAiConfigurationService {
    inspection: Partial<PreferenceInspection<unknown>> = {};
    readonly sets: RecordedSet[] = [];

    inspect(): PreferenceInspection<unknown> | undefined {
        return {
            preferenceName: 'test',
            defaultValue: undefined,
            globalValue: undefined,
            workspaceValue: undefined,
            workspaceFolderValue: undefined,
            value: undefined,
            ...this.inspection
        };
    }

    set(preferenceId: string, value: unknown, scope?: PreferenceScope, resourceUri?: string): Promise<void> {
        this.sets.push({ preferenceId, value, scope, resourceUri });
        return Promise.resolve();
    }
}

function createService(inspection: Partial<PreferenceInspection<unknown>>): { service: AiSettingsRowService; preferences: FakeAiConfigurationService } {
    const preferences = new FakeAiConfigurationService();
    preferences.inspection = inspection;
    const service = new AiSettingsRowService();
    (service as unknown as { aiConfigurationService: AiConfigurationService }).aiConfigurationService = preferences as unknown as AiConfigurationService;
    return { service, preferences };
}

function createServiceWithSchema(property: PreferenceDataProperty | undefined): AiSettingsRowService {
    const service = new AiSettingsRowService();
    const schemaService: Partial<PreferenceSchemaService> = {
        getSchemaProperty: () => property
    };
    (service as unknown as { schemaService: PreferenceSchemaService }).schemaService = schemaService as PreferenceSchemaService;
    return service;
}

describe('AiSettingsRowService', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('inspect', () => {
        it('resolves the user-scope value falling back to the default', () => {
            const { service } = createService({ defaultValue: 'd', globalValue: undefined });
            const result = service.inspect('pref', 'user');
            expect(result.value).to.equal('d');
            expect(result.scopeValue).to.equal(undefined);
            expect(result.modified).to.equal(false);
        });

        it('reports a user-scope override as modified', () => {
            const { service } = createService({ defaultValue: 'd', globalValue: 'u' });
            const result = service.inspect('pref', 'user');
            expect(result.value).to.equal('u');
            expect(result.scopeValue).to.equal('u');
            expect(result.modified).to.equal(true);
        });

        it('resolves the workspace value falling back through user then default', () => {
            const { service } = createService({ defaultValue: 'd', globalValue: 'u' });
            const workspace = service.inspect('pref', 'workspace');
            expect(workspace.value).to.equal('u');
            expect(workspace.scopeValue).to.equal(undefined);
            expect(workspace.modified).to.equal(false);

            const { service: service2 } = createService({ defaultValue: 'd', globalValue: 'u', workspaceValue: 'w' });
            const workspace2 = service2.inspect('pref', 'workspace');
            expect(workspace2.value).to.equal('w');
            expect(workspace2.modified).to.equal(true);
        });

        it('resolves the folder value falling back through workspace, user then default', () => {
            const { service } = createService({ defaultValue: 'd', globalValue: 'u', workspaceValue: 'w' });
            const folder = service.inspect('pref', 'folder');
            expect(folder.value).to.equal('w');
            expect(folder.modified).to.equal(false);

            const { service: service2 } = createService({ defaultValue: 'd', workspaceFolderValue: 'f' });
            const folder2 = service2.inspect('pref', 'folder');
            expect(folder2.value).to.equal('f');
            expect(folder2.modified).to.equal(true);
        });

        it('treats a value of `false` as an explicit override (not inherited)', () => {
            const { service } = createService({ defaultValue: true, globalValue: false });
            const result = service.inspect('pref', 'user');
            expect(result.value).to.equal(false);
            expect(result.modified).to.equal(true);
        });
    });

    describe('controlFor', () => {
        it('maps primitive schema types to their inline controls', () => {
            expect(createServiceWithSchema({ type: 'boolean' }).controlFor('pref').type).to.equal('boolean');
            expect(createServiceWithSchema({ type: 'number' }).controlFor('pref').type).to.equal('number');
            expect(createServiceWithSchema({ type: 'integer' }).controlFor('pref').type).to.equal('number');
            expect(createServiceWithSchema({ type: 'string' }).controlFor('pref').type).to.equal('string');
            expect(createServiceWithSchema(undefined).controlFor('pref').type).to.equal('string');
        });

        it('marks only an integer schema as whole-number, so a number keeps what the user typed', () => {
            // Both render the stepper; only the integer one may round on commit.
            expect(createServiceWithSchema({ type: 'integer' }).controlFor('pref')).to.deep.include({ type: 'number', integer: true });
            expect(createServiceWithSchema({ type: 'number' }).controlFor('pref')).to.not.have.property('integer');
        });

        it('maps an enum to a select regardless of its base type', () => {
            expect(createServiceWithSchema({ type: 'string', enum: ['a', 'b'] }).controlFor('pref').type).to.equal('select');
        });

        it('masks secret string preferences (API keys/tokens) with a password input', () => {
            const control = createServiceWithSchema({ type: 'string' }).controlFor('ai-features.anthropic.apiKey');
            expect(control).to.deep.include({ type: 'string', password: true });
            expect(createServiceWithSchema({ type: 'string' }).controlFor('ai-features.anthropic.model'))
                .to.deep.include({ type: 'string', password: false });
        });

        it('renders the inline list editor for string arrays', () => {
            expect(createServiceWithSchema({ type: 'array', items: { type: 'string' } }).controlFor('pref').type).to.equal('array');
        });

        it('defers object and non-string-array preferences to the Settings UI via a json control', () => {
            expect(createServiceWithSchema({ type: 'object' }).controlFor('pref').type).to.equal('json');
            expect(createServiceWithSchema({ type: 'array', items: { type: 'object' } }).controlFor('pref').type).to.equal('json');
            expect(createServiceWithSchema({ type: 'array', items: { type: 'number' } }).controlFor('pref').type).to.equal('json');
        });
    });

    describe('enumOptions', () => {
        it('uses the value as the label and enumDescriptions as the option description (never the description as the label)', () => {
            const options = createServiceWithSchema({
                type: 'string',
                enum: ['default', 'enabled'],
                enumDescriptions: ['Use the default', 'Force enabled']
            }).enumOptions('pref');
            expect(options).to.deep.equal([
                { value: 'default', label: 'default', description: 'Use the default' },
                { value: 'enabled', label: 'enabled', description: 'Force enabled' }
            ]);
        });

        it('prefers an explicit enumItemLabels entry for the label', () => {
            const options = createServiceWithSchema({
                type: 'string',
                enum: ['a'],
                enumItemLabels: ['Option A'],
                enumDescriptions: ['desc']
            }).enumOptions('pref');
            expect(options[0]).to.deep.equal({ value: 'a', label: 'Option A', description: 'desc' });
        });

        it('returns an empty list when the property declares no enum', () => {
            expect(createServiceWithSchema({ type: 'string' }).enumOptions('pref')).to.deep.equal([]);
        });
    });

    describe('modelProviderLabel', () => {
        it('returns the provider label declared under the aiModelProvider typeDetails', () => {
            const service = createServiceWithSchema({ type: 'string', typeDetails: { aiModelProvider: { label: 'Anthropic' } } });
            expect(service.modelProviderLabel('pref')).to.equal('Anthropic');
        });

        it('returns undefined when no provider label is declared', () => {
            expect(createServiceWithSchema({ type: 'string' }).modelProviderLabel('pref')).to.equal(undefined);
            expect(createServiceWithSchema({ type: 'string', typeDetails: { other: 'x' } }).modelProviderLabel('pref')).to.equal(undefined);
            // The metadata must be an object carrying a string `label`.
            expect(createServiceWithSchema({ type: 'string', typeDetails: { aiModelProvider: 'Anthropic' } }).modelProviderLabel('pref')).to.equal(undefined);
            expect(createServiceWithSchema({ type: 'string', typeDetails: { aiModelProvider: { label: 42 } } }).modelProviderLabel('pref')).to.equal(undefined);
            expect(createServiceWithSchema(undefined).modelProviderLabel('pref')).to.equal(undefined);
        });
    });

    describe('editInSettings', () => {
        it('opens settings.json focused on the preference via the preferences JSON command', () => {
            const executed: { command: string; args: unknown[] }[] = [];
            const service = new AiSettingsRowService();
            (service as unknown as { commandService: CommandService }).commandService = {
                executeCommand: (command: string, ...args: unknown[]) => {
                    executed.push({ command, args });
                    return Promise.resolve(undefined);
                }
            } as CommandService;

            service.editInSettings('my.pref');

            expect(executed).to.deep.equal([{ command: PreferencesCommands.OPEN_PREFERENCES_JSON_TOOLBAR.id, args: ['my.pref'] }]);
        });
    });

    describe('normalizeMarkdown', () => {
        const normalize = (markdown: string): string =>
            (new AiSettingsRowService() as unknown as { normalizeMarkdown(md: string): string }).normalizeMarkdown(markdown);

        it('strips the shared indentation of continuation lines so lists render as lists', () => {
            const raw = [
                'Allows custom settings.',
                '            Each setting consists of:',
                '            - `scope`: when it applies',
                '              - `modelId` (optional)',
                '            - `requestSettings`: values'
            ].join('\n');
            const expected = [
                'Allows custom settings.',
                'Each setting consists of:',
                '- `scope`: when it applies',
                '  - `modelId` (optional)',
                '- `requestSettings`: values'
            ].join('\n');
            expect(normalize(raw)).to.equal(expected);
        });

        it('leaves single-line and already-flush descriptions untouched', () => {
            expect(normalize('A short description.')).to.equal('A short description.');
            expect(normalize('First line.\nSecond line.')).to.equal('First line.\nSecond line.');
        });

        it('ignores blank lines when computing the shared indentation', () => {
            expect(normalize('Intro.\n\n    - item')).to.equal('Intro.\n\n- item');
        });
    });

    describe('set / reset', () => {
        it('writes to the mapped preference scope', () => {
            const { service, preferences } = createService({});
            return service.set('pref', 42, 'workspace').then(() => {
                expect(preferences.sets).to.deep.equal([{ preferenceId: 'pref', value: 42, scope: PreferenceScope.Workspace, resourceUri: undefined }]);
            });
        });

        it('resets by writing `undefined` to the mapped scope', () => {
            const { service, preferences } = createService({});
            return service.reset('pref', 'user', 'file:///ws').then(() => {
                expect(preferences.sets).to.deep.equal([{ preferenceId: 'pref', value: undefined, scope: PreferenceScope.User, resourceUri: 'file:///ws' }]);
            });
        });
    });
});
