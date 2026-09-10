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
import { LanguageModelMetaData } from './language-model';
import { compareModelsByRecency, groupModelsByProvider, providerOf } from './language-model-util';

function model(id: string, released?: number, vendor?: string): LanguageModelMetaData {
    return { id, released, vendor, status: { status: 'ready' } };
}

describe('compareModelsByRecency', () => {

    it('puts the most recently released model first', () => {
        const sorted = [
            model('anthropic/claude-haiku-4-5', Date.parse('2025-10-01')),
            model('anthropic/claude-opus-5', Date.parse('2026-04-01'))
        ].sort(compareModelsByRecency);
        expect(sorted.map(entry => entry.id)).to.deep.equal(['anthropic/claude-opus-5', 'anthropic/claude-haiku-4-5']);
    });

    it('falls back to the id when no release date is reported, as for Gemini', () => {
        const sorted = [model('google/gemini-3.7-flash'), model('google/gemini-3.1-pro')].sort(compareModelsByRecency);
        expect(sorted.map(entry => entry.id)).to.deep.equal(['google/gemini-3.1-pro', 'google/gemini-3.7-flash']);
    });

    it('sorts a model without a reported date after the dated ones rather than to the top', () => {
        const sorted = [
            model('openai/undated'),
            model('openai/dated', Date.parse('2020-01-01'))
        ].sort(compareModelsByRecency);
        expect(sorted.map(entry => entry.id)).to.deep.equal(['openai/dated', 'openai/undated']);
    });
});

describe('providerOf', () => {

    it('prefers the declared vendor', () => {
        expect(providerOf(model('openai/gpt-5.5', undefined, 'openai'))).to.equal('openai');
    });

    it('falls back to the id prefix', () => {
        expect(providerOf(model('anthropic/claude-opus-5'))).to.equal('anthropic');
    });

    it('yields an empty provider for an unprefixed id, e.g. a custom endpoint', () => {
        expect(providerOf(model('my-local-model'))).to.equal('');
    });
});

describe('groupModelsByProvider', () => {

    it('groups by provider, ordering the groups by name and their models by recency', () => {
        const groups = groupModelsByProvider([
            model('openai/gpt-5.5', Date.parse('2025-08-01')),
            model('anthropic/claude-haiku-4-5', Date.parse('2025-10-01')),
            model('openai/gpt-5.6-sol', Date.parse('2026-02-01')),
            model('anthropic/claude-opus-5', Date.parse('2026-04-01'))
        ]);
        expect(groups.map(group => group.provider)).to.deep.equal(['anthropic', 'openai']);
        expect(groups[0].models.map(entry => entry.id)).to.deep.equal(['anthropic/claude-opus-5', 'anthropic/claude-haiku-4-5']);
        expect(groups[1].models.map(entry => entry.id)).to.deep.equal(['openai/gpt-5.6-sol', 'openai/gpt-5.5']);
    });

    it('leaves the input untouched', () => {
        const models = [model('b/second'), model('a/first')];
        groupModelsByProvider(models);
        expect(models.map(entry => entry.id)).to.deep.equal(['b/second', 'a/first']);
    });
});
