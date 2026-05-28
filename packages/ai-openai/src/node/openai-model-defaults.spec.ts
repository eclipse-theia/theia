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
import { getOpenAiModelDefaults } from './openai-model-defaults';

describe('getOpenAiModelDefaults', () => {
    it('returns empty defaults for unknown models', () => {
        expect(getOpenAiModelDefaults('totally-made-up-model')).to.deep.equal({});
    });

    describe('GPT-5.5', () => {
        it('matches base and pro at 1,050,000 with GPT-5 reasoning', () => {
            for (const id of ['gpt-5.5', 'gpt-5.5-pro']) {
                const d = getOpenAiModelDefaults(id);
                expect(d.contextWindow, id).to.equal(1_050_000);
                expect(d.reasoningSupport?.supportedLevels, id).to.include('minimal');
            }
        });
    });

    describe('GPT-5.4', () => {
        it('matches base and pro at 1,050,000', () => {
            expect(getOpenAiModelDefaults('gpt-5.4').contextWindow).to.equal(1_050_000);
            expect(getOpenAiModelDefaults('gpt-5.4-pro').contextWindow).to.equal(1_050_000);
        });

        it('matches mini and nano at 400,000 (specific prefix wins over `gpt-5.4`)', () => {
            expect(getOpenAiModelDefaults('gpt-5.4-mini').contextWindow).to.equal(400_000);
            expect(getOpenAiModelDefaults('gpt-5.4-nano').contextWindow).to.equal(400_000);
        });
    });

    describe('GPT-5', () => {
        it('matches base, pro, mini, nano, codex at 400,000', () => {
            for (const id of ['gpt-5', 'gpt-5-pro', 'gpt-5-mini', 'gpt-5-nano', 'gpt-5-codex']) {
                expect(getOpenAiModelDefaults(id).contextWindow, id).to.equal(400_000);
            }
        });

        it('exposes GPT-5 reasoning support (incl. `minimal`)', () => {
            const d = getOpenAiModelDefaults('gpt-5');
            expect(d.reasoningSupport?.supportedLevels).to.include('minimal');
            expect(d.reasoningSupport?.defaultLevel).to.equal('auto');
        });
    });

    describe('GPT-4.1', () => {
        it('matches the family at 1,047,576 with no reasoning', () => {
            for (const id of ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano']) {
                const d = getOpenAiModelDefaults(id);
                expect(d.contextWindow, id).to.equal(1_047_576);
                expect(d.reasoningSupport, id).to.equal(undefined);
            }
        });
    });

    describe('GPT-4o', () => {
        it('matches base, mini, and most snapshots at 128,000 with structured output enabled', () => {
            for (const id of ['gpt-4o', 'gpt-4o-mini', 'gpt-4o-2024-08-06']) {
                const d = getOpenAiModelDefaults(id);
                expect(d.contextWindow, id).to.equal(128_000);
                expect(d.supportsStructuredOutput, id).to.equal(undefined); // default true at the manager
            }
        });

        it('flags the gpt-4o-2024-05-13 snapshot as not supporting structured output', () => {
            const d = getOpenAiModelDefaults('gpt-4o-2024-05-13');
            expect(d.contextWindow).to.equal(128_000);
            expect(d.supportsStructuredOutput).to.equal(false);
        });
    });

    describe('GPT-4 turbo / 32k / base', () => {
        it('matches gpt-4-turbo at 128,000 (no structured output)', () => {
            const d = getOpenAiModelDefaults('gpt-4-turbo-2024-04-09');
            expect(d.contextWindow).to.equal(128_000);
            expect(d.supportsStructuredOutput).to.equal(false);
        });

        it('matches gpt-4-32k at 32,768 (no structured output)', () => {
            const d = getOpenAiModelDefaults('gpt-4-32k');
            expect(d.contextWindow).to.equal(32_768);
            expect(d.supportsStructuredOutput).to.equal(false);
        });

        it('falls back to gpt-4 (8,192) for the base model', () => {
            const d = getOpenAiModelDefaults('gpt-4-0613');
            expect(d.contextWindow).to.equal(8_192);
            expect(d.supportsStructuredOutput).to.equal(false);
        });
    });

    describe('GPT-3.5', () => {
        it('matches gpt-3.5-turbo and snapshots at 16,385 (no structured output)', () => {
            for (const id of ['gpt-3.5-turbo', 'gpt-3.5-turbo-16k', 'gpt-3.5-turbo-0125']) {
                const d = getOpenAiModelDefaults(id);
                expect(d.contextWindow, id).to.equal(16_385);
                expect(d.supportsStructuredOutput, id).to.equal(false);
            }
        });
    });

    describe('o-series', () => {
        it('matches o4 and o3 families at 200,000 with o-series reasoning', () => {
            for (const id of ['o4-mini', 'o3', 'o3-mini', 'o3-pro']) {
                const d = getOpenAiModelDefaults(id);
                expect(d.contextWindow, id).to.equal(200_000);
                expect(d.reasoningSupport?.supportedLevels, id).to.not.include('minimal');
            }
        });

        it('matches o1 / o1-pro at 200,000', () => {
            expect(getOpenAiModelDefaults('o1').contextWindow).to.equal(200_000);
            expect(getOpenAiModelDefaults('o1-pro').contextWindow).to.equal(200_000);
        });

        it('matches o1-preview / o1-mini at 128,000 with the legacy "user" role and no structured output', () => {
            for (const id of ['o1-preview', 'o1-mini']) {
                const d = getOpenAiModelDefaults(id);
                expect(d.contextWindow, id).to.equal(128_000);
                expect(d.developerMessageSettings, id).to.equal('user');
                expect(d.supportsStructuredOutput, id).to.equal(false);
                expect(d.reasoningSupport, id).to.not.equal(undefined);
            }
        });
    });
});
