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
import { PreferenceService } from '@theia/core';
import { DiscoveredModel, ModelDiscoveryStatus } from '../common/model-discovery-status';
import { FavoriteModelsService } from './favorite-models-service';
import { ModelDiscoveryStatusService } from './model-discovery-status-service';

function dated(id: string, released: string): DiscoveredModel {
    return { id, released: Date.parse(released) };
}

function createService(
    statuses: ModelDiscoveryStatus[],
    marked: string[] = [],
    aliasedModelIds: string[] = []
): { service: FavoriteModelsService; written: string[][] } {
    const service = new FavoriteModelsService();
    const written: string[][] = [];
    const discoveryStatus: Partial<ModelDiscoveryStatusService> = { getStatuses: () => statuses };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).aliasRegistry = {
        getAliases: () => [{ id: 'default', defaultModelIds: aliasedModelIds }]
    };
    const preferenceService: Partial<PreferenceService> = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        get: (() => marked) as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set: (async (_name: string, value: any) => { written.push(value); }) as any
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).discoveryStatus = discoveryStatus;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (service as any).preferenceService = preferenceService;
    return { service, written };
}

function status(overrides: Partial<ModelDiscoveryStatus> = {}): ModelDiscoveryStatus {
    return { providerId: 'anthropic', label: 'Anthropic', state: 'ready', ...overrides };
}

describe('FavoriteModelsService', () => {

    it('features the five most recently released undated models, never a release-pinned one', () => {
        const { service } = createService([status({
            discovered: [
                dated('claude-opus-5', '2026-04-01'),
                dated('claude-sonnet-5', '2026-02-01'),
                dated('claude-haiku-4-5', '2025-10-01'),
                dated('claude-fable-5', '2025-09-01'),
                dated('claude-opus-4-8', '2025-08-01'),
                dated('claude-opus-4-7', '2025-06-01'),
                dated('claude-opus-5-20260401', '2026-04-01')
            ]
        })]);
        expect(service.isFeatured('anthropic/claude-opus-5')).to.equal(true);
        expect(service.isFeatured('anthropic/claude-opus-4-8')).to.equal(true);
        // The sixth-newest falls outside the featured set.
        expect(service.isFeatured('anthropic/claude-opus-4-7')).to.equal(false);
        // A release-pinned id is never featured, however recent it is.
        expect(service.isFeatured('anthropic/claude-opus-5-20260401')).to.equal(false);
    });

    it('caps a provider that reports no release dates, leading with what an alias names', () => {
        const { service } = createService(
            [status({
                providerId: 'google',
                discovered: [
                    { id: 'gemini-2.0-pro' }, { id: 'gemini-2.5-flash' }, { id: 'gemini-2.5-pro' },
                    { id: 'gemini-3.1-pro-preview' }, { id: 'gemini-3.5-flash' }, { id: 'gemini-3.7-flash' }
                ]
            })],
            [],
            ['google/gemini-3.1-pro-preview']
        );
        // Named by an alias, then the highest versions in the ids; the oldest of the six drops out.
        expect(service.isFeatured('google/gemini-3.1-pro-preview')).to.equal(true);
        expect(service.isFeatured('google/gemini-3.7-flash')).to.equal(true);
        expect(service.isFeatured('google/gemini-2.5-pro')).to.equal(true);
        expect(service.isFeatured('google/gemini-2.0-pro')).to.equal(false);
    });

    it('features what a built-in alias names even when the provider reports it as older', () => {
        const { service } = createService(
            [status({
                discovered: [
                    dated('claude-opus-5', '2026-04-01'),
                    dated('claude-sonnet-5', '2026-03-01'),
                    dated('claude-fable-5', '2026-02-01'),
                    dated('claude-opus-4-8', '2026-01-01'),
                    dated('claude-opus-4-7', '2025-12-01'),
                    dated('claude-haiku-4-5', '2025-10-01')
                ]
            })],
            [],
            ['anthropic/claude-haiku-4-5']
        );
        // The oldest of the six, but an alias points at it, so it is offered and the runner-up drops out.
        expect(service.isFeatured('anthropic/claude-haiku-4-5')).to.equal(true);
        expect(service.isFeatured('anthropic/claude-opus-4-7')).to.equal(false);
    });

    it('prunes a marked model that a successful discovery no longer offers', () => {
        const { service, written } = createService(
            [status({ discovered: [dated('claude-opus-5', '2026-04-01')] })],
            ['anthropic/claude-gone', 'openai/gpt-5.5']
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (service as any).pruneFavorites(status({ discovered: [dated('claude-opus-5', '2026-04-01')] }));
        // Only the vanished model of that provider is dropped; another provider's stars are untouched.
        expect(written[0]).to.deep.equal(['openai/gpt-5.5']);
    });

    it('keeps the marked models when the discovery did not actually reach the provider', () => {
        const { service, written } = createService([], ['anthropic/claude-gone']);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prune = (candidate: ModelDiscoveryStatus) => (service as any).pruneFavorites(candidate);
        prune(status({ state: 'ready', fromCache: true, discovered: [] }));
        prune(status({ state: 'error' }));
        prune(status({ state: 'no-credentials' }));
        prune(status({ state: 'ready', discovered: undefined }));
        expect(written).to.be.empty;
    });

    it('respects a provider that nominates its own models, as Copilot does across vendors', () => {
        const { service } = createService([status({
            providerId: 'copilot',
            discovered: [
                { id: 'auto', featured: true },
                { id: 'gpt-5', featured: true },
                { id: 'claude-sonnet-4.5', featured: true },
                { id: 'gpt-4.1' },
                { id: 'claude-haiku-4' },
                { id: 'gemini-2.5-pro' }
            ]
        })]);
        expect(service.isFeatured('copilot/auto')).to.equal(true);
        expect(service.isFeatured('copilot/claude-sonnet-4.5')).to.equal(true);
        // Not nominated, and the generic "five newest" ranking does not apply where a provider nominated.
        expect(service.isFeatured('copilot/gpt-4.1')).to.equal(false);
        expect(service.isFeatured('copilot/gemini-2.5-pro')).to.equal(false);
    });

    it('also features what an alias names, next to a provider\'s nomination', () => {
        const { service } = createService(
            [status({
                providerId: 'copilot',
                discovered: [{ id: 'gpt-5', featured: true }, { id: 'claude-haiku-4' }]
            })],
            [],
            ['copilot/claude-haiku-4']
        );
        expect(service.isFeatured('copilot/gpt-5')).to.equal(true);
        expect(service.isFeatured('copilot/claude-haiku-4')).to.equal(true);
    });

    it('features a manually configured list in full', () => {
        const { service } = createService([status({
            state: 'overridden',
            discovered: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }, { id: 'f' }]
        })]);
        expect(service.isFeatured('anthropic/f')).to.equal(true);
    });

    it('honours the models the user marked', () => {
        const { service } = createService(
            [status({ discovered: [dated('claude-opus-5', '2026-04-01'), dated('claude-opus-4-7', '2024-06-01')] })],
            ['anthropic/claude-opus-5-20260401']
        );
        expect(service.isFavorite('anthropic/claude-opus-5-20260401')).to.equal(true);
        expect(service.isFavorite('anthropic/claude-opus-4-7')).to.equal(true); // featured, only two undated ids
        expect(service.isFavorite('anthropic/claude-unknown')).to.equal(false);
    });

    it('treats the models of a provider that does not participate in discovery as favorites', () => {
        const { service } = createService([status({ discovered: [dated('claude-opus-5', '2026-04-01')] })]);
        // Manually configured providers (ollama, hugging face, …) and custom endpoints are the user's own list.
        expect(service.isFavorite('ollama/llama3')).to.equal(true);
        expect(service.isFavorite('my-custom-endpoint-model')).to.equal(true);
    });

    it('honours the model-id prefix when it differs from the provider id', () => {
        const { service } = createService([status({
            providerId: 'openAiOfficial',
            modelIdPrefix: 'openai',
            discovered: [dated('gpt-5.6-sol', '2026-02-01')]
        })]);
        expect(service.isFeatured('openai/gpt-5.6-sol')).to.equal(true);
    });

    describe('toggleFavorite', () => {

        it('adds and removes an id the user can control', async () => {
            const { service, written } = createService([status({ discovered: [dated('claude-opus-5', '2026-04-01')] })], []);
            await service.toggleFavorite('anthropic/claude-opus-5-20260401');
            expect(written[0]).to.deep.equal(['anthropic/claude-opus-5-20260401']);

            const removing = createService([status({ discovered: [dated('claude-opus-5', '2026-04-01')] })], ['anthropic/claude-opus-5-20260401']);
            await removing.service.toggleFavorite('anthropic/claude-opus-5-20260401');
            expect(removing.written[0]).to.deep.equal([]);
        });

        it('refuses to unmark a featured model, which is offered regardless', async () => {
            const { service, written } = createService([status({ discovered: [dated('claude-opus-5', '2026-04-01')] })]);
            await service.toggleFavorite('anthropic/claude-opus-5');
            expect(written).to.be.empty;
        });
    });
});
