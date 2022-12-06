// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

/* eslint-disable no-null/no-null */

import { OVSXRouterClient } from './ovsx-router-client';
import { testClientProvider, registries, filterFactories } from './ovsx-router-client.spec-data';
import { ExtensionLike } from './ovsx-types';
import assert = require('assert');

describe('OVSXRouterClient', async () => {

    const router = await OVSXRouterClient.FromConfig(
        {
            registries,
            use: ['internal', 'public', 'third'],
            rules: [{
                ifRequestContains: /\btestFullStop\b/.source,
                use: null,
            },
            {
                ifRequestContains: /\bsecret\b/.source,
                use: 'internal'
            },
            {
                ifExtensionIdMatches: /^some\./.source,
                use: 'internal'
            }]
        },
        testClientProvider,
        filterFactories,
    );

    it('test query agglomeration', async () => {
        const result = await router.query({ namespaceName: 'other' });
        assert.deepStrictEqual(result.extensions.map(ExtensionLike.id), [
            // note the order: plugins from "internal" first then from "public"
            'other.d',
            'other.e'
        ]);
    });

    it('test query request filtering', async () => {
        const result = await router.query({ namespaceName: 'secret' });
        assert.deepStrictEqual(result.extensions.map(ExtensionLike.id), [
            // 'secret.w' from 'public' shouldn't be returned
            'secret.x',
            'secret.y',
            'secret.z'
        ]);
    });

    it('test query result filtering', async () => {
        const result = await router.query({ namespaceName: 'some' });
        assert.deepStrictEqual(result.extensions.map(ExtensionLike.idWithVersion), [
            // no entry for the `some` namespace should be returned from the `public` registry
            'some.a@1.0.0'
        ]);
    });

    it('test query full stop', async () => {
        const result = await router.query({ extensionId: 'testFullStop.c' });
        assert.deepStrictEqual(result.extensions.length, 0);
    });

    it('test search agglomeration', async () => {
        const result = await router.search({ query: 'other.' });
        assert.deepStrictEqual(result.extensions.map(ExtensionLike.id), [
            // note the order: plugins from "internal" first then from "public"
            'other.d',
            'other.e'
        ]);
    });

    it('test search request filtering', async () => {
        const result = await router.search({ query: 'secret.' });
        assert.deepStrictEqual(result.extensions.map(ExtensionLike.id), [
            // 'secret.w' from 'public' shouldn't be returned
            'secret.x',
            'secret.y',
            'secret.z'
        ]);
    });

    it('test search result filtering', async () => {
        const result = await router.search({ query: 'some.' });
        assert.deepStrictEqual(result.extensions.map(ExtensionLike.idWithVersion), [
            // no entry for the `some` namespace should be returned from the `public` registry
            'some.a@1.0.0'
        ]);
    });

    it('test search full stop', async () => {
        const result = await router.search({ query: 'testFullStop.c' });
        assert.deepStrictEqual(result.extensions.length, 0);
    });

    it('test config with unknown conditions', async () => {
        const clientPromise = OVSXRouterClient.FromConfig(
            {
                use: 'not relevant',
                rules: [{
                    ifRequestContains: /.*/.source,
                    unknownCondition: /should cause an error to be thrown/.source,
                    use: ['internal', 'public']
                }]
            },
            testClientProvider,
            filterFactories
        );
        assert.rejects(clientPromise, /^Error: unknown conditions:/);
    });
});
