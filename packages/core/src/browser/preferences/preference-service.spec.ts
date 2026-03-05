// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import { enableJSDOM } from '../test/jsdom';

let disableJSDOM = enableJSDOM();

import * as assert from 'assert';
import { Container } from 'inversify';
import { PreferenceChange, PreferenceChanges, PreferenceProvider, PreferenceScope, PreferenceService, PreferenceServiceImpl } from '../../common/preferences';
import { PreferenceSchema, PreferenceSchemaService } from '../../common/preferences/preference-schema';
import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';
import { bindMockPreferenceProviders, MockPreferenceProvider } from './test';
import { PreferenceChangeEvent, createPreferenceProxy } from '../../common/preferences/preference-proxy';
import { bindPreferenceService } from '../frontend-application-bindings';

disableJSDOM();

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
    throw reason;
});

const { expect } = require('chai');
let testContainer: Container;

function createTestContainer(): Container {
    const result = new Container();
    bindPreferenceService(result.bind.bind(result));
    bindMockPreferenceProviders(result.bind.bind(result), result.unbind.bind(result));
    return result;
}

describe('Preference Service', () => {
    let prefService: PreferenceServiceImpl;
    let prefSchema: PreferenceSchemaService;

    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({});
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(async () => {
        testContainer = createTestContainer();
        prefSchema = testContainer.get(PreferenceSchemaService);
        prefService = testContainer.get<PreferenceService>(PreferenceService) as PreferenceServiceImpl;
        getProvider(PreferenceScope.User).markReady();
        getProvider(PreferenceScope.Workspace).markReady();
        getProvider(PreferenceScope.Folder).markReady();
        console.log('before ready');
        try {
            await prefService.ready;
        } catch (e) {
            console.error(e);
        }
        console.log('done');
    });

    afterEach(() => {
    });

    function getProvider(scope: PreferenceScope): MockPreferenceProvider {
        return testContainer.getNamed(PreferenceProvider, scope) as MockPreferenceProvider;
    }

    it('should return the preference from the more specific scope (user > workspace)', () => {
        prefSchema.addSchema({
            scope: PreferenceScope.Folder,
            properties: {
                'test.number': {
                    type: 'number',
                }
            }
        });
        const userProvider = getProvider(PreferenceScope.User);
        const workspaceProvider = getProvider(PreferenceScope.Workspace);
        const folderProvider = getProvider(PreferenceScope.Folder);
        userProvider.setPreference('test.number', 1);
        expect(prefService.get('test.number')).equals(1);
        workspaceProvider.setPreference('test.number', 0);
        expect(prefService.get('test.number')).equals(0);
        folderProvider.setPreference('test.number', 2);
        expect(prefService.get('test.number')).equals(2);

        // remove property on lower scope
        folderProvider.setPreference('test.number', undefined);
        expect(prefService.get('test.number')).equals(0);
    });

    it('should throw a TypeError if the preference (reference object) is modified', () => {
        prefSchema.addSchema({
            scope: PreferenceScope.Folder,
            properties: {
                'test.immutable': {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                }
            }
        });
        const userProvider = getProvider(PreferenceScope.User);
        userProvider.setPreference('test.immutable', [
            'test', 'test', 'test'
        ]);
        const immutablePref: string[] | undefined = prefService.get('test.immutable');
        expect(immutablePref).to.not.be.undefined;
        if (immutablePref !== undefined) {
            expect(() => immutablePref.push('fails')).to.throw(TypeError);
        }
    });

    it('should still report the more specific preference even though the less specific one changed', () => {
        prefSchema.addSchema({
            scope: PreferenceScope.Folder,
            properties: {
                'test.number': {
                    type: 'number',
                }
            }
        });
        const userProvider = getProvider(PreferenceScope.User);
        const workspaceProvider = getProvider(PreferenceScope.Workspace);
        userProvider.setPreference('test.number', 1);
        workspaceProvider.setPreference('test.number', 0);
        expect(prefService.get('test.number')).equals(0);

        userProvider.setPreference('test.number', 4);
        expect(prefService.get('test.number')).equals(0);
    });

    it('should not fire events if preference schema is unset in the same tick ', async () => {
        const events: PreferenceChange[] = [];
        prefService.onPreferenceChanged(event => events.push(event));
        prefSchema.registerOverrideIdentifier('go');

        const toUnset = prefSchema.addSchema({
            scope: PreferenceScope.User,
            properties: {
                'editor.insertSpaces': {
                    type: 'boolean',
                    default: true,
                    overridable: true
                }
            }
        });

        prefSchema.registerOverride('editor.insertSpaces', 'go', false);
        assert.deepStrictEqual([], events.map(e => e.preferenceName), 'events after set in the same tick');
        assert.strictEqual(prefService.get('editor.insertSpaces'), true, 'get before');
        assert.strictEqual(prefService.get('editor.insertSpaces', { override: 'go' }), false, 'get before overridden');

        toUnset.dispose();

        assert.deepStrictEqual([], events.map(e => e.preferenceName), 'events after unset in the same tick');
        assert.strictEqual(prefService.get('editor.insertSpaces'), undefined, 'get after'); // removing the schema does not removes the default value
        assert.strictEqual(prefService.get('editor.insertSpaces', { override: 'go' }), false, 'get after overridden'); // but not the override

        assert.deepStrictEqual([], events.map(e => e.preferenceName), 'events in next tick');
    });

    it('should fire events if preference schema is unset in another tick', async () => {
        prefSchema.registerOverrideIdentifier('go');

        let pending = new Promise<PreferenceChanges>(resolve => prefService.onPreferencesChanged(resolve));
        const toUnset = prefSchema.addSchema({
            scope: PreferenceScope.User,
            properties: {
                'editor.insertSpaces': {
                    type: 'boolean',
                    default: true,
                    overridable: true
                }
            }
        });
        prefSchema.registerOverride('editor.insertSpaces', 'go', false);
        let changes = await pending;

        assert.deepStrictEqual([
            { preferenceName: 'editor.insertSpaces', overrideIdentifier: undefined },
            { preferenceName: 'editor.insertSpaces', overrideIdentifier: 'go' },
        ], Object.values(changes).map((change: PreferenceChange) => ({
            preferenceName: change.preferenceName,
            overrideIdentifier: change.overrideIdentifier
        })), 'events before');
        assert.strictEqual(prefService.get('editor.insertSpaces'), true, 'get before');
        assert.strictEqual(prefService.get('editor.insertSpaces', { override: 'go' }), false, 'get before overridden');

        pending = new Promise<PreferenceChanges>(resolve => prefService.onPreferencesChanged(resolve));
        toUnset.dispose();
        changes = await pending;

        assert.deepStrictEqual([
            { preferenceName: 'editor.insertSpaces', overrideIdentifier: undefined },
            { preferenceName: 'editor.insertSpaces', overrideIdentifier: 'go' },
        ], Object.values(changes).map((change: PreferenceChange) => ({
            preferenceName: change.preferenceName,
            overrideIdentifier: change.overrideIdentifier
        })), 'events after');
        assert.strictEqual(prefService.get('editor.insertSpaces'), undefined, 'get after');
        assert.strictEqual(prefService.get('editor.insertSpaces', { override: 'go' }), false, 'get after overridden');
    });

    function prepareServices(options?: { schema: PreferenceSchema }): {
        preferences: PreferenceServiceImpl;
        schema: PreferenceSchemaService;
    } {
        prefSchema.addSchema(options && options.schema || {
            scope: PreferenceScope.User,
            properties: {
                'editor.tabSize': {
                    type: 'number',
                    default: 4,
                    description: '',
                    overridable: true,
                }
            }
        });

        return { preferences: prefService, schema: prefSchema };
    }

    describe('PreferenceService.updateValues()', () => {
        const TAB_SIZE = 'editor.tabSize';
        const DUMMY_URI = 'dummy_uri';
        async function generateAndCheckValues(
            preferences: PreferenceService,
            globalValue: number | undefined,
            workspaceValue: number | undefined,
            workspaceFolderValue: number | undefined
        ): Promise<void> {
            await preferences.set(TAB_SIZE, globalValue, PreferenceScope.User);
            await preferences.set(TAB_SIZE, workspaceValue, PreferenceScope.Workspace);
            await preferences.set(TAB_SIZE, workspaceFolderValue, PreferenceScope.Folder, DUMMY_URI);
            const expectedValue = workspaceFolderValue ?? workspaceValue ?? globalValue ?? 4;
            checkValues(preferences, globalValue, workspaceValue, workspaceFolderValue, expectedValue);
        }

        function checkValues(
            preferences: PreferenceService,
            globalValue: number | undefined,
            workspaceValue: number | undefined,
            workspaceFolderValue: number | undefined,
            value: number = 4,
        ): void {
            const expected = {
                preferenceName: 'editor.tabSize',
                defaultValue: 4,
                globalValue,
                workspaceValue,
                workspaceFolderValue,
                value,
            };
            const inspection = preferences.inspect(TAB_SIZE, DUMMY_URI);
            assert.deepStrictEqual(inspection, expected);
        }

        it('should modify the narrowest scope.', async () => {
            const { preferences } = prepareServices();

            await generateAndCheckValues(preferences, 1, 2, 3);
            await preferences.updateValue(TAB_SIZE, 8, DUMMY_URI);
            checkValues(preferences, 1, 2, 8, 8);

            await generateAndCheckValues(preferences, 1, 2, undefined);
            await preferences.updateValue(TAB_SIZE, 8, DUMMY_URI);
            checkValues(preferences, 1, 8, undefined, 8);

            await generateAndCheckValues(preferences, 1, undefined, undefined);
            await preferences.updateValue(TAB_SIZE, 8, DUMMY_URI);
            checkValues(preferences, 8, undefined, undefined, 8);
        });

        it('defaults to user scope.', async () => {
            const { preferences } = prepareServices();
            checkValues(preferences, undefined, undefined, undefined);
            await preferences.updateValue(TAB_SIZE, 8, DUMMY_URI);
            checkValues(preferences, 8, undefined, undefined, 8);
        });

        it('clears all settings when input is undefined.', async () => {
            const { preferences } = prepareServices();

            await generateAndCheckValues(preferences, 1, 2, 3);
            await preferences.updateValue(TAB_SIZE, undefined, DUMMY_URI);
            checkValues(preferences, undefined, undefined, undefined);
        });

        it('deletes user setting if user is only defined scope and target is default value', async () => {
            const { preferences } = prepareServices();

            await generateAndCheckValues(preferences, 8, undefined, undefined);
            await preferences.updateValue(TAB_SIZE, 4, DUMMY_URI);
            checkValues(preferences, undefined, undefined, undefined);
        });

        it('does not delete setting in lower scopes, even if target is default', async () => {
            const { preferences } = prepareServices();

            await generateAndCheckValues(preferences, undefined, 2, undefined);
            await preferences.updateValue(TAB_SIZE, 4, DUMMY_URI);
            checkValues(preferences, undefined, 4, undefined);
        });
    });

    describe('get overloads', () => {

        function setupSchema(): void {
            prefSchema.addSchema({
                scope: PreferenceScope.Folder,
                properties: {
                    'test.string': { type: 'string' },
                    'test.number': { type: 'number' },
                    'test.boolean': { type: 'boolean' },
                    'test.array': { type: 'array', items: { type: 'string' } }
                }
            });
        }

        it('returns the string default when no value is stored', () => {
            setupSchema();
            const value: string = prefService.get('test.string', 'default');
            expect(value).to.equal('default');
        });

        it('returns the stored string value over the default', () => {
            setupSchema();
            getProvider(PreferenceScope.User).setPreference('test.string', 'stored');
            const value: string = prefService.get('test.string', 'default');
            expect(value).to.equal('stored');
        });

        it('returns the number default when no value is stored', () => {
            setupSchema();
            const value: number = prefService.get('test.number', 42);
            expect(value).to.equal(42);
        });

        it('returns the stored number value over the default', () => {
            setupSchema();
            getProvider(PreferenceScope.User).setPreference('test.number', 7);
            const value: number = prefService.get('test.number', 42);
            expect(value).to.equal(7);
        });

        it('returns the boolean default when no value is stored', () => {
            setupSchema();
            const value: boolean = prefService.get('test.boolean', true);
            expect(value).to.equal(true);
        });

        it('returns the stored boolean value over the default', () => {
            setupSchema();
            getProvider(PreferenceScope.User).setPreference('test.boolean', false);
            const value: boolean = prefService.get('test.boolean', true);
            expect(value).to.equal(false);
        });

        it('returns the array default when no value is stored', () => {
            setupSchema();
            const value: string[] = prefService.get<string>('test.array', ['a', 'b']);
            expect(value).to.deep.equal(['a', 'b']);
        });

        it('returns the stored array value over the default', () => {
            setupSchema();
            getProvider(PreferenceScope.User).setPreference('test.array', ['x', 'y']);
            const value: string[] = prefService.get<string>('test.array', []);
            expect(value).to.deep.equal(['x', 'y']);
        });

        it('still supports the options form alongside the new overloads', () => {
            setupSchema();
            expect(prefService.get('test.string', { fallback: 'opts' })).to.equal('opts');
            expect(prefService.get('test.number', { fallback: 5 })).to.equal(5);
            expect(prefService.get('test.boolean', { fallback: false })).to.equal(false);
            expect(prefService.get<string[]>('test.array', { fallback: ['c'] })).to.deep.equal(['c']);
            expect(prefService.get('test.string')).to.be.undefined;
        });
    });

    describe('overridden preferences', () => {

        it('get #0', () => {
            const { preferences } = prepareServices();

            preferences.set('editor.tabSize', 2, PreferenceScope.User, undefined, 'json');

            expect(preferences.get('editor.tabSize')).to.equal(4);
            expect(preferences.get('editor.tabSize', { override: 'json' })).to.equal(2);
        });

        it('get #1', () => {
            const { preferences, schema } = prepareServices();
            schema.registerOverrideIdentifier('json');

            expect(preferences.get('editor.tabSize')).to.equal(4);
            expect(preferences.get('editor.tabSize', { override: 'json' })).to.equal(4);

            preferences.set('editor.tabSize', 2, PreferenceScope.User, undefined, 'json');

            expect(preferences.get('editor.tabSize')).to.equal(4);
            expect(preferences.get('editor.tabSize', { override: 'json' })).to.equal(2);
        });

        it('get #2', () => {
            const { preferences, schema } = prepareServices();
            schema.registerOverrideIdentifier('json');

            expect(preferences.get('editor.tabSize')).to.equal(4);
            expect(preferences.get('editor.tabSize', { override: 'json' })).to.equal(4);

            preferences.set('editor.tabSize', 2, PreferenceScope.User);

            expect(preferences.get('editor.tabSize')).to.equal(2);
            expect(preferences.get('editor.tabSize', { override: 'json' })).to.equal(2);
        });

        it('has', () => {
            const { preferences, schema } = prepareServices();

            expect(preferences.has('editor.tabSize')).to.be.true;
            expect(preferences.has('editor.tabSize', undefined, 'json')).to.be.false;

            schema.registerOverrideIdentifier('json');

            expect(preferences.has('editor.tabSize')).to.be.true;
            expect(preferences.has('editor.tabSize', undefined, 'json')).to.be.true;
        });

        it('inspect #0', () => {
            const { preferences, schema } = prepareServices();

            const expected = {
                preferenceName: 'editor.tabSize',
                defaultValue: 4,
                globalValue: undefined,
                workspaceValue: undefined,
                workspaceFolderValue: undefined,
                value: 4,
            };
            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
            assert.ok(!preferences.has('editor.tabSize', undefined, 'json'));

            schema.registerOverrideIdentifier('json');

            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
        });

        it('inspect #1', () => {
            const { preferences, schema } = prepareServices();

            const expected = {
                preferenceName: 'editor.tabSize',
                defaultValue: 4,
                globalValue: 2,
                workspaceValue: undefined,
                workspaceFolderValue: undefined,
                value: 2
            };
            preferences.set('editor.tabSize', 2, PreferenceScope.User);

            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'), 'before override');
            assert.ok(!preferences.has('editor.tabSize', undefined, 'json'));

            schema.registerOverrideIdentifier('json');

            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'), 'after override');
            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize', undefined, 'json'), 'after override with json identifier');
        });

        it('inspect #2', () => {
            const { preferences, schema } = prepareServices();

            const expected = {
                preferenceName: 'editor.tabSize',
                defaultValue: 4,
                globalValue: undefined,
                workspaceValue: undefined,
                workspaceFolderValue: undefined,
                value: 4
            };
            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
            assert.ok(!preferences.has('editor.tabSize', undefined, 'json'));

            schema.registerOverrideIdentifier('json');
            preferences.set('editor.tabSize', 2, PreferenceScope.User, undefined, 'json');

            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
            assert.deepStrictEqual({
                ...expected,
                globalValue: 2,
                value: 2,
            }, preferences.inspect('editor.tabSize', undefined, 'json'));
        });

        it('onPreferenceChanged #0', async () => {
            const { preferences, schema } = prepareServices();

            const events: PreferenceChange[] = [];
            preferences.onPreferenceChanged(event => events.push(event));

            schema.registerOverrideIdentifier('json');
            preferences.set('[json].editor.tabSize', 2, PreferenceScope.User);
            await preferences.set('editor.tabSize', 3, PreferenceScope.User);

            assert.deepStrictEqual([
                '[json].editor.tabSize',
                'editor.tabSize'
            ], events.map(e => e.preferenceName));
        });

        it('onPreferenceChanged #1', async () => {
            const { preferences, schema } = prepareServices();

            const events: PreferenceChange[] = [];
            preferences.onPreferenceChanged(event => events.push(event));

            schema.registerOverrideIdentifier('json');
            await preferences.set('editor.tabSize', 2, PreferenceScope.User);

            assert.deepStrictEqual([
                { preferenceName: 'editor.tabSize', overrideIdentifier: undefined },
            ], events.map(e => ({ preferenceName: e.preferenceName, overrideIdentifier: e.overrideIdentifier })));
        });

        it('onPreferenceChanged #2', async function (): Promise<void> {
            const { preferences, schema } = prepareServices();

            schema.registerOverrideIdentifier('json');
            schema.registerOverrideIdentifier('javascript');
            preferences.set('editor.tabSize', 2, PreferenceScope.User, undefined, 'json');
            await preferences.set('editor.tabSize', 3, PreferenceScope.User);

            const events: PreferenceChangeEvent<{ [key: string]: any }>[] = [];
            const proxy = createPreferenceProxy<{ [key: string]: any }>(preferences, schema.getJSONSchema(PreferenceScope.Folder), { overrideIdentifier: 'json' });
            proxy.onPreferenceChanged(event => events.push(event));

            await preferences.set('editor.tabSize', 4, PreferenceScope.User, undefined, 'javascript');

            assert.deepStrictEqual([], events.map(e => e.preferenceName), 'changes not relevant to json override should be ignored');
        });

        it('onPreferenceChanged #3', async () => {
            const { preferences, schema } = prepareServices();

            schema.registerOverrideIdentifier('json');
            preferences.set('[json].editor.tabSize', 2, PreferenceScope.User);
            await preferences.set('editor.tabSize', 3, PreferenceScope.User);

            const events: PreferenceChange[] = [];
            preferences.onPreferenceChanged(event => events.push(event));

            await preferences.set('[json].editor.tabSize', undefined, PreferenceScope.User);

            assert.deepStrictEqual(['[json].editor.tabSize'], events.map(e => e.preferenceName));
        });

        it('defaultOverrides [go].editor.formatOnSave', () => {
            const { preferences, schema } = prepareServices({
                schema: {
                    scope: PreferenceScope.Folder,
                    properties: {
                        'editor.insertSpaces': {
                            type: 'boolean',
                            default: true,
                            overridable: true
                        },
                        'editor.formatOnSave': {
                            type: 'boolean',
                            default: false,
                            overridable: true
                        }
                    }
                }
            });

            assert.strictEqual(true, preferences.get('editor.insertSpaces'));
            assert.strictEqual(undefined, preferences.get('editor.insertSpaces', { override: 'go' }));
            assert.strictEqual(false, preferences.get('editor.formatOnSave'));
            assert.strictEqual(undefined, preferences.get('editor.formatOnSave', { override: 'go' }));

            schema.registerOverrideIdentifier('go');
            prefSchema.registerOverride('editor.insertSpaces', 'go', false);
            prefSchema.registerOverride('editor.formatOnSave', 'go', true);

            assert.strictEqual(true, preferences.get('editor.insertSpaces'));
            assert.strictEqual(false, preferences.get('editor.insertSpaces', { override: 'go' }));
            assert.strictEqual(false, preferences.get('editor.formatOnSave'));
            assert.strictEqual(true, preferences.get('editor.formatOnSave', { override: 'go' }));
        });
    });

});
