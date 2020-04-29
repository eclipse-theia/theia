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

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-unused-expressions */

import { enableJSDOM } from '../test/jsdom';

let disableJSDOM = enableJSDOM();

import * as assert from 'assert';
import { Container } from 'inversify';
import { bindPreferenceService } from '../frontend-application-bindings';
import { bindMockPreferenceProviders, MockPreferenceProvider } from './test';
import { PreferenceService, PreferenceServiceImpl, PreferenceChange, PreferenceChanges } from './preference-service';
import { PreferenceSchemaProvider, PreferenceSchema } from './preference-contribution';
import { PreferenceScope } from './preference-scope';
import { PreferenceProvider } from './preference-provider';
import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';
import { createPreferenceProxy, PreferenceChangeEvent } from './preference-proxy';

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
    let prefSchema: PreferenceSchemaProvider;

    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({
            'applicationName': 'test',
        });
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(async () => {
        testContainer = createTestContainer();
        prefSchema = testContainer.get(PreferenceSchemaProvider);
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
        prefSchema.setSchema({
            properties: {
                'test.number': {
                    type: 'number',
                    scope: 'resource'
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
        prefSchema.setSchema({
            properties: {
                'test.immutable': {
                    type: 'array',
                    items: {
                        type: 'string'
                    },
                    scope: 'resource'
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
        prefSchema.setSchema({
            properties: {
                'test.number': {
                    type: 'number',
                    scope: 'resource'
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

        const toUnset = prefSchema.setSchema({
            properties: {
                'editor.insertSpaces': {
                    type: 'boolean',
                    default: true,
                    overridable: true
                },
                '[go]': {
                    type: 'object',
                    default: {
                        'editor.insertSpaces': false
                    }
                }
            }
        });
        assert.deepStrictEqual([], events.map(e => ({
            preferenceName: e.preferenceName,
            newValue: e.newValue,
            oldValue: e.oldValue
        })), 'events after set in the same tick');
        assert.strictEqual(prefService.get('editor.insertSpaces'), true, 'get before');
        assert.strictEqual(prefService.get('[go].editor.insertSpaces'), false, 'get before overridden');

        toUnset.dispose();

        assert.deepStrictEqual([], events.map(e => ({
            preferenceName: e.preferenceName,
            newValue: e.newValue,
            oldValue: e.oldValue
        })), 'events after unset in the same tick');
        assert.strictEqual(prefService.get('editor.insertSpaces'), undefined, 'get after');
        assert.strictEqual(prefService.get('[go].editor.insertSpaces'), undefined, 'get after overridden');

        assert.strictEqual(await prefSchema.pendingChanges, false);
        assert.deepStrictEqual([], events.map(e => ({
            preferenceName: e.preferenceName,
            newValue: e.newValue,
            oldValue: e.oldValue
        })), 'events in next tick');
    });

    it('should fire events if preference schema is unset in another tick', async () => {
        prefSchema.registerOverrideIdentifier('go');

        let pending = new Promise<PreferenceChanges>(resolve => prefService.onPreferencesChanged(resolve));
        const toUnset = prefSchema.setSchema({
            properties: {
                'editor.insertSpaces': {
                    type: 'boolean',
                    default: true,
                    overridable: true
                },
                '[go]': {
                    type: 'object',
                    default: {
                        'editor.insertSpaces': false
                    }
                }
            }
        });
        let changes = await pending;

        assert.deepStrictEqual([{
            preferenceName: 'editor.insertSpaces',
            newValue: true,
            oldValue: undefined
        }, {
            preferenceName: '[go].editor.insertSpaces',
            newValue: false,
            oldValue: undefined
        }], Object.keys(changes).map(key => {
            const { preferenceName, newValue, oldValue } = changes[key];
            return { preferenceName, newValue, oldValue };
        }), 'events before');
        assert.strictEqual(prefService.get('editor.insertSpaces'), true, 'get before');
        assert.strictEqual(prefService.get('[go].editor.insertSpaces'), false, 'get before overridden');

        pending = new Promise<PreferenceChanges>(resolve => prefService.onPreferencesChanged(resolve));
        toUnset.dispose();
        changes = await pending;

        assert.deepStrictEqual([{
            preferenceName: 'editor.insertSpaces',
            newValue: undefined,
            oldValue: true
        }, {
            preferenceName: '[go].editor.insertSpaces',
            newValue: undefined,
            oldValue: false
        }], Object.keys(changes).map(key => {
            const { preferenceName, newValue, oldValue } = changes[key];
            return { preferenceName, newValue, oldValue };
        }), 'events after');
        assert.strictEqual(prefService.get('editor.insertSpaces'), undefined, 'get after');
        assert.strictEqual(prefService.get('[go].editor.insertSpaces'), undefined, 'get after overridden');
    });

    describe('overridden preferences', () => {

        it('get #0', () => {
            const { preferences, schema } = prepareServices();

            preferences.set('[json].editor.tabSize', 2, PreferenceScope.User);

            expect(preferences.get('editor.tabSize')).to.equal(4);
            expect(preferences.get('[json].editor.tabSize')).to.equal(undefined);

            schema.registerOverrideIdentifier('json');

            expect(preferences.get('editor.tabSize')).to.equal(4);
            expect(preferences.get('[json].editor.tabSize')).to.equal(2);
        });

        it('get #1', () => {
            const { preferences, schema } = prepareServices();
            schema.registerOverrideIdentifier('json');

            expect(preferences.get('editor.tabSize')).to.equal(4);
            expect(preferences.get('[json].editor.tabSize')).to.equal(4);

            preferences.set('[json].editor.tabSize', 2, PreferenceScope.User);

            expect(preferences.get('editor.tabSize')).to.equal(4);
            expect(preferences.get('[json].editor.tabSize')).to.equal(2);
        });

        it('get #2', () => {
            const { preferences, schema } = prepareServices();
            schema.registerOverrideIdentifier('json');

            expect(preferences.get('editor.tabSize')).to.equal(4);
            expect(preferences.get('[json].editor.tabSize')).to.equal(4);

            preferences.set('editor.tabSize', 2, PreferenceScope.User);

            expect(preferences.get('editor.tabSize')).to.equal(2);
            expect(preferences.get('[json].editor.tabSize')).to.equal(2);
        });

        it('has', () => {
            const { preferences, schema } = prepareServices();

            expect(preferences.has('editor.tabSize')).to.be.true;
            expect(preferences.has('[json].editor.tabSize')).to.be.false;

            schema.registerOverrideIdentifier('json');

            expect(preferences.has('editor.tabSize')).to.be.true;
            expect(preferences.has('[json].editor.tabSize')).to.be.true;
        });

        it('inspect #0', () => {
            const { preferences, schema } = prepareServices();

            const expected = {
                preferenceName: 'editor.tabSize',
                defaultValue: 4,
                globalValue: undefined,
                workspaceValue: undefined,
                workspaceFolderValue: undefined,
            };
            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
            assert.ok(!preferences.has('[json].editor.tabSize'));

            schema.registerOverrideIdentifier('json');

            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
            assert.deepStrictEqual({
                ...expected,
                preferenceName: '[json].editor.tabSize'
            }, preferences.inspect('[json].editor.tabSize'));
        });

        it('inspect #1', () => {
            const { preferences, schema } = prepareServices();

            const expected = {
                preferenceName: 'editor.tabSize',
                defaultValue: 4,
                globalValue: 2,
                workspaceValue: undefined,
                workspaceFolderValue: undefined,
            };
            preferences.set('editor.tabSize', 2, PreferenceScope.User);

            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
            assert.ok(!preferences.has('[json].editor.tabSize'));

            schema.registerOverrideIdentifier('json');

            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
            assert.deepStrictEqual({
                ...expected,
                preferenceName: '[json].editor.tabSize'
            }, preferences.inspect('[json].editor.tabSize'));
        });

        it('inspect #2', () => {
            const { preferences, schema } = prepareServices();

            const expected = {
                preferenceName: 'editor.tabSize',
                defaultValue: 4,
                globalValue: undefined,
                workspaceValue: undefined,
                workspaceFolderValue: undefined,
            };
            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
            assert.ok(!preferences.has('[json].editor.tabSize'));

            schema.registerOverrideIdentifier('json');
            preferences.set('[json].editor.tabSize', 2, PreferenceScope.User);

            assert.deepStrictEqual(expected, preferences.inspect('editor.tabSize'));
            assert.deepStrictEqual({
                ...expected,
                preferenceName: '[json].editor.tabSize',
                globalValue: 2
            }, preferences.inspect('[json].editor.tabSize'));
        });

        it('onPreferenceChanged #0', async () => {
            const { preferences, schema } = prepareServices();
            await schema.pendingChanges;

            const events: PreferenceChange[] = [];
            preferences.onPreferenceChanged(event => events.push(event));

            schema.registerOverrideIdentifier('json');
            preferences.set('[json].editor.tabSize', 2, PreferenceScope.User);
            await preferences.set('editor.tabSize', 3, PreferenceScope.User);

            assert.deepStrictEqual([{
                preferenceName: '[json].editor.tabSize',
                newValue: 2
            }, {
                preferenceName: 'editor.tabSize',
                newValue: 3
            }], events.map(e => ({
                preferenceName: e.preferenceName,
                newValue: e.newValue
            })));
        });

        it('onPreferenceChanged #1', async () => {
            const { preferences, schema } = prepareServices();
            await schema.pendingChanges;

            const events: PreferenceChange[] = [];
            preferences.onPreferenceChanged(event => events.push(event));

            schema.registerOverrideIdentifier('json');
            await preferences.set('editor.tabSize', 2, PreferenceScope.User);

            assert.deepStrictEqual([{
                preferenceName: 'editor.tabSize',
                newValue: 2
            }, {
                preferenceName: '[json].editor.tabSize',
                newValue: 2
            }], events.map(e => ({
                preferenceName: e.preferenceName,
                newValue: e.newValue
            })));
        });

        it('onPreferenceChanged #2', async function (): Promise<void> {
            const { preferences, schema } = prepareServices();

            schema.registerOverrideIdentifier('json');
            schema.registerOverrideIdentifier('javascript');
            preferences.set('[json].editor.tabSize', 2, PreferenceScope.User);
            await preferences.set('editor.tabSize', 3, PreferenceScope.User);

            const events: PreferenceChangeEvent<{ [key: string]: any }>[] = [];
            const proxy = createPreferenceProxy<{ [key: string]: any }>(preferences, schema.getCombinedSchema(), { overrideIdentifier: 'json' });
            proxy.onPreferenceChanged(event => events.push(event));

            await preferences.set('[javascript].editor.tabSize', 4, PreferenceScope.User);

            assert.deepStrictEqual([], events.map(e => ({
                preferenceName: e.preferenceName,
                newValue: e.newValue
            })), 'changes not relevant to json override should be ignored');
        });

        it('onPreferenceChanged #3', async () => {
            const { preferences, schema } = prepareServices();

            schema.registerOverrideIdentifier('json');
            preferences.set('[json].editor.tabSize', 2, PreferenceScope.User);
            await preferences.set('editor.tabSize', 3, PreferenceScope.User);

            const events: PreferenceChange[] = [];
            preferences.onPreferenceChanged(event => events.push(event));

            await preferences.set('[json].editor.tabSize', undefined, PreferenceScope.User);

            assert.deepStrictEqual([{
                preferenceName: '[json].editor.tabSize',
                newValue: 3
            }], events.map(e => ({
                preferenceName: e.preferenceName,
                newValue: e.newValue
            })));
        });

        it('defaultOverrides [go].editor.formatOnSave', () => {
            const { preferences, schema } = prepareServices({
                schema: {
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
            assert.strictEqual(undefined, preferences.get('[go].editor.insertSpaces'));
            assert.strictEqual(false, preferences.get('editor.formatOnSave'));
            assert.strictEqual(undefined, preferences.get('[go].editor.formatOnSave'));

            schema.registerOverrideIdentifier('go');
            schema.setSchema({
                id: 'defaultOverrides',
                title: 'Default Configuration Overrides',
                properties: {
                    '[go]': {
                        type: 'object',
                        default: {
                            'editor.insertSpaces': false,
                            'editor.formatOnSave': true
                        },
                        description: 'Configure editor settings to be overridden for go language.'
                    }
                }
            });

            assert.strictEqual(true, preferences.get('editor.insertSpaces'));
            assert.strictEqual(false, preferences.get('[go].editor.insertSpaces'));
            assert.strictEqual(false, preferences.get('editor.formatOnSave'));
            assert.strictEqual(true, preferences.get('[go].editor.formatOnSave'));
        });

        function prepareServices(options?: { schema: PreferenceSchema }): {
            preferences: PreferenceServiceImpl;
            schema: PreferenceSchemaProvider;
        } {
            prefSchema.setSchema(options && options.schema || {
                properties: {
                    'editor.tabSize': {
                        type: 'number',
                        description: '',
                        overridable: true,
                        default: 4
                    }
                }
            });

            return { preferences: prefService, schema: prefSchema };
        }

    });

});
