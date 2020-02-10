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
import { PreferenceService, PreferenceServiceImpl } from './preference-service';
import { PreferenceSchemaProvider, PreferenceSchema } from './preference-contribution';
import { PreferenceScope } from './preference-scope';
import { PreferenceProvider } from './preference-provider';
import { FrontendApplicationConfigProvider } from '../frontend-application-config-provider';
import { createPreferenceProxy, PreferenceProxyOptions, PreferenceProxy, PreferenceChangeEvent } from './preference-proxy';

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

describe('Preference Proxy', () => {
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

    function getProxy(schema?: PreferenceSchema, options?: PreferenceProxyOptions): PreferenceProxy<{ [key: string]: any }> {
        const s: PreferenceSchema = schema || {
            properties: {
                'my.pref': {
                    type: 'string',
                    defaultValue: 'foo'
                }
            }
        };
        prefSchema.setSchema(s);
        return createPreferenceProxy(prefService, s, options);
    }

    it('by default, it should get provide access in flat style but not deep', () => {
        const proxy = getProxy();
        expect(proxy['my.pref']).to.equal('foo');
        expect(proxy.my).to.equal(undefined);
        expect(Object.keys(proxy).join()).to.equal(['my.pref'].join());
    });

    it('it should get provide access in deep style but not flat', () => {
        const proxy = getProxy(undefined, { style: 'deep' });
        expect(proxy['my.pref']).to.equal(undefined);
        expect(proxy.my.pref).to.equal('foo');
        expect(Object.keys(proxy).join()).to.equal(['my'].join());
    });

    it('it should get provide access in to both styles', () => {
        const proxy = getProxy(undefined, { style: 'both' });
        expect(proxy['my.pref']).to.equal('foo');
        expect(proxy.my.pref).to.equal('foo');
        expect(Object.keys(proxy).join()).to.equal(['my', 'my.pref'].join());
    });

    it('it should forward change events', () => {
        const proxy = getProxy(undefined, { style: 'both' });
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

        getProvider(PreferenceScope.User).setPreference('my.pref', 'bar');

        expect(theChange!.newValue).to.equal('bar');
        expect(theChange!.oldValue).to.equal(undefined);
        expect(theChange!.preferenceName).to.equal('my.pref');
        expect(theSecondChange!.newValue).to.equal('bar');
        expect(theSecondChange!.oldValue).to.equal(undefined);
        expect(theSecondChange!.preferenceName).to.equal('my.pref');
    });

    it('toJSON with deep', () => {
        const proxy = getProxy({
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
});
