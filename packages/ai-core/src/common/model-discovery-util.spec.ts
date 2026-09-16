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

import { expect } from 'chai';
import { DiscoveredModels } from './model-discovery-util';

describe('DiscoveredModels.undatedId', () => {

    it('strips a compact date suffix, as Anthropic uses', () => {
        expect(DiscoveredModels.undatedId('claude-opus-5-20260401')).to.equal('claude-opus-5');
    });

    it('strips a dashed date suffix, as OpenAI uses', () => {
        expect(DiscoveredModels.undatedId('gpt-4o-2024-11-20')).to.equal('gpt-4o');
    });

    it('strips the year-less snapshot suffix of OpenAI\'s older models', () => {
        expect(DiscoveredModels.undatedId('gpt-4-0613')).to.equal('gpt-4');
        expect(DiscoveredModels.undatedId('gpt-3.5-turbo-0125')).to.equal('gpt-3.5-turbo');
    });

    it('returns undefined for an id without a date suffix', () => {
        expect(DiscoveredModels.undatedId('claude-opus-5')).to.equal(undefined);
        expect(DiscoveredModels.undatedId('gemini-3.7-flash')).to.equal(undefined);
        // A version suffix is not a date and must not be mistaken for one.
        expect(DiscoveredModels.undatedId('gemini-1.5-pro-002')).to.equal(undefined);
        // Nor is a context size, even though it is four digits like a month and day.
        expect(DiscoveredModels.undatedId('some-model-4096')).to.equal(undefined);
        expect(DiscoveredModels.undatedId('gpt-4-1340')).to.equal(undefined);
    });
});

describe('DiscoveredModels.withUndatedAliases', () => {

    it('adds the undated alias while keeping the release-pinned ids', () => {
        const result = DiscoveredModels.withUndatedAliases([
            { id: 'claude-opus-5-20260401' },
            { id: 'claude-haiku-4-5-20251001' }
        ]);
        expect(result.map(model => model.id)).to.deep.equal([
            'claude-opus-5',
            'claude-haiku-4-5',
            'claude-opus-5-20260401',
            'claude-haiku-4-5-20251001'
        ]);
    });

    it('adds one alias per family and gives it the metadata of the newest release', () => {
        const result = DiscoveredModels.withUndatedAliases([
            { id: 'claude-opus-5-20251120', label: 'Claude Opus 5 (November)', released: Date.parse('2025-11-20') },
            { id: 'claude-opus-5-20260401', label: 'Claude Opus 5', released: Date.parse('2026-04-01') }
        ]);
        expect(result.map(model => model.id)).to.deep.equal([
            'claude-opus-5',
            'claude-opus-5-20251120',
            'claude-opus-5-20260401'
        ]);
        expect(result[0].label).to.equal('Claude Opus 5');
    });

    it('orders the variants by the reported release date, which the year-less ids cannot express', () => {
        const result = DiscoveredModels.withUndatedAliases([
            // June 2023 sorts after January 2024 by id alone; the reported dates say otherwise.
            { id: 'gpt-4-0613', label: 'older', released: Date.parse('2023-06-13') },
            { id: 'gpt-4-0125', label: 'newer', released: Date.parse('2024-01-25') }
        ]);
        expect(result[0].id).to.equal('gpt-4');
        expect(result[0].label).to.equal('newer');
    });

    it('falls back to the date in the id when the provider reports none', () => {
        const result = DiscoveredModels.withUndatedAliases([
            { id: 'claude-opus-5-20251120', label: 'older' },
            { id: 'claude-opus-5-20260401', label: 'newer' }
        ]);
        expect(result[0].label).to.equal('newer');
    });

    it('leaves an alias the provider reported itself untouched', () => {
        const result = DiscoveredModels.withUndatedAliases([
            { id: 'gpt-4o', label: 'GPT-4o' },
            { id: 'gpt-4o-2024-11-20', label: 'GPT-4o (2024-11-20)' }
        ]);
        expect(result.map(model => model.id)).to.deep.equal(['gpt-4o', 'gpt-4o-2024-11-20']);
        expect(result[0].label).to.equal('GPT-4o');
    });

    it('passes undated models through unchanged', () => {
        const models = [{ id: 'gemini-3.7-flash' }, { id: 'gemini-3.1-pro-preview' }];
        expect(DiscoveredModels.withUndatedAliases(models)).to.deep.equal(models);
    });
});
