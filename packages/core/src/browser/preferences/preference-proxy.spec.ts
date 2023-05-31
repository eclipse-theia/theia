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
import { bindPreferenceService } from '../frontend-application-bindings';
import { bindMockPreferenceProviders, MockPreferenceProvider } from './test';
import { PreferenceService, PreferenceServiceImpl } from './preference-service';
import { PreferenceSchemaProvider, PreferenceSchema } from './preference-contribution';
import { PreferenceScope } from './preference-scope';
import { PreferenceProvider } from './preference-provider';
import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';
import { PreferenceProxyOptions, PreferenceProxy, PreferenceChangeEvent, createPreferenceProxy } from './preference-proxy';
import { PreferenceProxyFactory } from './injectable-preference-proxy';
import { waitForEvent } from '../../common/promise-util';

disableJSDOM();

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
    throw reason;
});

import { expect } from 'chai';
let testContainer: Container;

function createTestContainer(): Container {
    const result = new Container();
    bindPreferenceService(result.bind.bind(result));
    bindMockPreferenceProviders(result.bind.bind(result), result.unbind.bind(result));
    return result;
}

describe('Preference Proxy', () => {
    let prefService: PreferenceServiceImpl;
    let prefSchema: PreferenceSchemaProvider;

    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({});
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
        try {
            await prefService.ready;
        } catch (e) {
            console.error(e);
        }
    });

    afterEach(() => {
    });

    // Actually run the test suite with different parameters:
    testPreferenceProxy('Synchronous Schema Definition + createPreferenceProxy', { asyncSchema: false });
    testPreferenceProxy('Asynchronous Schema Definition (1s delay) + createPreferenceProxy', { asyncSchema: true });
    testPreferenceProxy('Synchronous Schema Definition + Injectable Preference Proxy', { asyncSchema: false, useFactory: true });
    testPreferenceProxy('Asynchronous Schema Definition (1s delay) + Injectable Preference Proxy', { asyncSchema: true, useFactory: true });

    function getProvider(scope: PreferenceScope): MockPreferenceProvider {
        return testContainer.getNamed(PreferenceProvider, scope) as MockPreferenceProvider;
    }

    function testPreferenceProxy(testDescription: string, testOptions: { asyncSchema: boolean, useFactory?: boolean }): void {

        describe(testDescription, () => {

            function getProxy(schema?: PreferenceSchema, options?: PreferenceProxyOptions): {
                proxy: PreferenceProxy<{ [key: string]: any }>,
                /** Only set if we are using a schema asynchronously. */
                promisedSchema?: Promise<PreferenceSchema>
            } {
                const s: PreferenceSchema = schema || {
                    properties: {
                        'my.pref': {
                            type: 'string',
                            defaultValue: 'foo'
                        }
                    }
                };
                if (testOptions.asyncSchema) {
                    const promisedSchema = new Promise<PreferenceSchema>(resolve => setTimeout(() => {
                        prefSchema.setSchema(s);
                        resolve(s);
                    }, 1000));
                    const proxy = testOptions.useFactory
                        ? testContainer.get<PreferenceProxyFactory>(PreferenceProxyFactory)(promisedSchema, options)
                        : createPreferenceProxy(prefService, promisedSchema, options);
                    return { proxy, promisedSchema };
                } else {
                    prefSchema.setSchema(s);
                    const proxy = testOptions.useFactory
                        ? testContainer.get<PreferenceProxyFactory>(PreferenceProxyFactory)(s, options)
                        : createPreferenceProxy(prefService, s, options);
                    return { proxy };
                }
            }

            if (testOptions.asyncSchema) {
                it('using the proxy before the schema is set should be no-op', async () => {
                    const { proxy, promisedSchema } = getProxy();
                    let changed = 0;
                    proxy.onPreferenceChanged(event => {
                        changed += 1;
                    });
                    expect(proxy['my.pref']).to.equal(undefined);
                    expect(Object.keys(proxy).length).to.equal(0);
                    // The proxy doesn't know the schema, so events shouldn't be forwarded:
                    await getProvider(PreferenceScope.User).setPreference('my.pref', 'bar');
                    expect(changed).to.equal(0);
                    expect(proxy['my.pref']).to.equal(undefined);
                    expect(Object.keys(proxy).length).to.equal(0);
                    // Once the schema is resolved, operations should be working:
                    await promisedSchema!;
                    expect(proxy['my.pref']).to.equal('bar');
                    expect(Object.keys(proxy)).members(['my.pref']);
                    await getProvider(PreferenceScope.User).setPreference('my.pref', 'fizz');
                    expect(changed).to.equal(1);
                    expect(proxy['my.pref']).to.equal('fizz');

                });
            }

            it('by default, it should provide access in flat style but not deep', async () => {
                const { proxy, promisedSchema } = getProxy();
                if (promisedSchema) {
                    await promisedSchema;
                }
                expect(proxy['my.pref']).to.equal('foo');
                expect(proxy.my).to.equal(undefined);
                expect(Object.keys(proxy).join()).to.equal(['my.pref'].join());
            });

            it('it should provide access in deep style but not flat', async () => {
                const { proxy, promisedSchema } = getProxy(undefined, { style: 'deep' });
                if (promisedSchema) {
                    await promisedSchema;
                }
                expect(proxy['my.pref']).to.equal(undefined);
                expect(proxy.my.pref).to.equal('foo');
                expect(Object.keys(proxy).join()).equal('my');
            });

            it('it should provide access in to both styles', async () => {
                const { proxy, promisedSchema } = getProxy(undefined, { style: 'both' });
                if (promisedSchema) {
                    await promisedSchema;
                }
                expect(proxy['my.pref']).to.equal('foo');
                expect(proxy.my.pref).to.equal('foo');
                expect(Object.keys(proxy).join()).to.equal(['my', 'my.pref'].join());
            });

            it('it should forward change events', async () => {
                const { proxy, promisedSchema } = getProxy(undefined, { style: 'both' });
                if (promisedSchema) {
                    await promisedSchema;
                }
                let theChange: PreferenceChangeEvent<{ [key: string]: any }>;
                proxy.onPreferenceChanged(change => {
                    expect(theChange).to.equal(undefined);
                    theChange = change;
                });
                let theSecondChange: PreferenceChangeEvent<{ [key: string]: any }>;
                (proxy.my as PreferenceProxy<{ [key: string]: any }>).onPreferenceChanged(change => {
                    expect(theSecondChange).to.equal(undefined);
                    theSecondChange = change;
                });

                await getProvider(PreferenceScope.User).setPreference('my.pref', 'bar');

                expect(theChange!.newValue).to.equal('bar');
                expect(theChange!.oldValue).to.equal(undefined);
                expect(theChange!.preferenceName).to.equal('my.pref');
                expect(theSecondChange!.newValue).to.equal('bar');
                expect(theSecondChange!.oldValue).to.equal(undefined);
                expect(theSecondChange!.preferenceName).to.equal('my.pref');
            });

            it("should not forward changes that don't match the proxy's language override", async () => {
                const { proxy, promisedSchema } = getProxy({
                    properties: {
                        'my.pref': {
                            type: 'string',
                            defaultValue: 'foo',
                            overridable: true,
                        }
                    }
                }, { style: 'both', overrideIdentifier: 'typescript' });
                await promisedSchema;
                let changeEventsEmittedByProxy = 0;
                let changeEventsEmittedByService = 0;
                prefSchema.registerOverrideIdentifier('swift');
                prefSchema.registerOverrideIdentifier('typescript');
                // The service will emit events related to updating the overrides - those are irrelevant
                await waitForEvent(prefService.onPreferencesChanged, 500);
                prefService.onPreferencesChanged(() => changeEventsEmittedByService++);
                proxy.onPreferenceChanged(() => changeEventsEmittedByProxy++);
                await prefService.set(prefService.overridePreferenceName({ overrideIdentifier: 'swift', preferenceName: 'my.pref' }), 'boo', PreferenceScope.User);
                expect(changeEventsEmittedByService, 'The service should have emitted an event for the non-matching override.').to.equal(1);
                expect(changeEventsEmittedByProxy, 'The proxy should not have emitted an event for the non-matching override.').to.equal(0);
                await prefService.set('my.pref', 'far', PreferenceScope.User);
                expect(changeEventsEmittedByService, 'The service should have emitted an event for the base name.').to.equal(2);
                expect(changeEventsEmittedByProxy, 'The proxy should have emitted for an event for the base name.').to.equal(1);
                await prefService.set(prefService.overridePreferenceName({ preferenceName: 'my.pref', overrideIdentifier: 'typescript' }), 'faz', PreferenceScope.User);
                expect(changeEventsEmittedByService, 'The service should have emitted an event for the matching override.').to.equal(3);
                expect(changeEventsEmittedByProxy, 'The proxy should have emitted an event for the matching override.').to.equal(2);
                await prefService.set('my.pref', 'yet another value', PreferenceScope.User);
                expect(changeEventsEmittedByService, 'The service should have emitted another event for the base name.').to.equal(4);
                expect(changeEventsEmittedByProxy, 'The proxy should not have emitted an event, because the value for TS has been overridden.').to.equal(2);
            });

            it('`affects` should only return `true` if the language overrides match', async () => {
                const { proxy, promisedSchema } = getProxy({
                    properties: {
                        'my.pref': {
                            type: 'string',
                            defaultValue: 'foo',
                            overridable: true,
                        }
                    }
                }, { style: 'both' });
                await promisedSchema;
                prefSchema.registerOverrideIdentifier('swift');
                prefSchema.registerOverrideIdentifier('typescript');
                let changesNotAffectingTypescript = 0;
                let changesAffectingTypescript = 0;
                proxy.onPreferenceChanged(change => {
                    if (change.affects(undefined, 'typescript')) {
                        changesAffectingTypescript++;
                    } else {
                        changesNotAffectingTypescript++;
                    }
                });
                await prefService.set('my.pref', 'bog', PreferenceScope.User);
                expect(changesNotAffectingTypescript, 'Two events (one for `my.pref` and one for `[swift].my.pref`) should not have affected TS').to.equal(2);
                expect(changesAffectingTypescript, 'One event should have been fired that does affect typescript.').to.equal(1);
            });

            it('toJSON with deep', async () => {
                const { proxy, promisedSchema } = getProxy({
                    properties: {
                        'foo.baz': {
                            type: 'number',
                            default: 4
                        },
                        'foo.bar.x': {
                            type: 'boolean',
                            default: true
                        },
                        'foo.bar.y': {
                            type: 'boolean',
                            default: false
                        },
                        'a': {
                            type: 'string',
                            default: 'a'
                        }
                    }
                }, { style: 'deep' });
                if (promisedSchema) {
                    await promisedSchema;
                }
                assert.deepStrictEqual(JSON.stringify(proxy, undefined, 2), JSON.stringify({
                    foo: {
                        baz: 4,
                        bar: {
                            x: true,
                            y: false
                        }
                    },
                    a: 'a'
                }, undefined, 2), 'there should not be foo.bar.x to avoid sending excessive data to remote clients');
            });

            it('get nested default', async () => {
                const { proxy, promisedSchema } = getProxy({
                    properties: {
                        'foo': {
                            'anyOf': [
                                {
                                    'enum': [
                                        false
                                    ]
                                },
                                {
                                    'properties': {
                                        'bar': {
                                            'anyOf': [
                                                {
                                                    'enum': [
                                                        false
                                                    ]
                                                },
                                                {
                                                    'properties': {
                                                        'x': {
                                                            type: 'boolean'
                                                        },
                                                        'y': {
                                                            type: 'boolean'
                                                        }
                                                    }
                                                }
                                            ]
                                        }
                                    }
                                }
                            ],
                            default: {
                                bar: {
                                    x: true,
                                    y: false
                                }
                            }
                        }
                    }
                }, { style: 'both' });
                if (promisedSchema) {
                    await promisedSchema;
                }
                assert.deepStrictEqual(proxy['foo'], {
                    bar: {
                        x: true,
                        y: false
                    }
                });
                assert.deepStrictEqual(proxy['foo.bar'], {
                    x: true,
                    y: false
                });
                assert.strictEqual(proxy['foo.bar.x'], true);
                assert.strictEqual(proxy['foo.bar.y'], false);
            });
        });
    }

});
