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

// @lumino/dragdrop (pulled in transitively via `codicon` from `@theia/core/lib/browser`) extends the
// DragEvent DOM global at module load, which JSDOM does not provide; stub it so the import succeeds.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(global as any).DragEvent) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).DragEvent = class DragEvent extends (global as any).Event { };
}

import { expect } from 'chai';
import * as React from '@theia/core/shared/react';
import { flushSync } from '@theia/core/shared/react-dom';
import { createRoot } from '@theia/core/shared/react-dom/client';
import { LanguageModel } from '@theia/ai-core/lib/common';
import { DiscoveredModel, ModelDiscoveryAction, ModelDiscoveryStatus } from '@theia/ai-core/lib/common/model-discovery-status';
import { FavoriteModelsService } from '@theia/ai-core/lib/browser';
import { Emitter } from '@theia/core';
import { ProviderModelDiscoverySection } from './provider-model-discovery-section';

disableJSDOM();

function model(id: string, ready: boolean = true, released?: number): LanguageModel {
    return { id, released, status: { status: ready ? 'ready' : 'unavailable', message: ready ? undefined : 'nope' } } as LanguageModel;
}

function status(overrides: Partial<ModelDiscoveryStatus> = {}): ModelDiscoveryStatus {
    return { providerId: 'anthropic', label: 'Anthropic', state: 'ready', ...overrides };
}

describe('ProviderModelDiscoverySection', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    /** Stands in for the service: featured = the ids given, marked = the rest of `favorite`. */
    function favoritesStub(featured: string[] = [], marked: string[] = []): FavoriteModelsService {
        const emitter = new Emitter<void>();
        const toggled: string[] = [];
        const stub: Partial<FavoriteModelsService> & { toggled: string[] } = {
            toggled,
            onDidChange: emitter.event,
            isFeatured: (id: string) => featured.includes(id),
            isFavorite: (id: string) => featured.includes(id) || marked.includes(id),
            getFavorites: () => marked,
            toggleFavorite: async (id: string) => { toggled.push(id); }
        };
        return stub as unknown as FavoriteModelsService;
    }

    function mount(
        models: LanguageModel[],
        discoveryStatus: ModelDiscoveryStatus = status(),
        favorites: FavoriteModelsService = favoritesStub(),
        actions: ModelDiscoveryAction[] = []
    ): { container: HTMLElement; dispose: () => void } {
        const container = document.createElement('div');
        document.body.appendChild(container);
        const root = createRoot(container);
        flushSync(() => root.render(React.createElement(ProviderModelDiscoverySection, {
            status: discoveryStatus,
            models,
            favorites,
            onRefresh: () => { },
            onAction: (action: ModelDiscoveryAction) => actions.push(action)
        })));
        return { container, dispose: () => { flushSync(() => root.unmount()); container.remove(); } };
    }

    function labels(container: HTMLElement): string[] {
        return [...container.querySelectorAll('.ai-configuration-item-row-label')].map(row => row.textContent ?? '');
    }

    function typeIntoFilter(container: HTMLElement, value: string): void {
        const input = container.querySelector<HTMLInputElement>('.ai-configuration-filter-input input')!;
        const view = container.ownerDocument.defaultView as unknown as { Event: typeof Event; HTMLInputElement: typeof HTMLInputElement };
        // Assigning `value` directly goes through React's patched setter, which then treats the change as
        // already handled and never calls `onChange`; the prototype's setter is what a real keystroke uses.
        const nativeSetter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, 'value')!.set!;
        flushSync(() => {
            nativeSetter.call(input, value);
            input.dispatchEvent(new view.Event('input', { bubbles: true }));
        });
    }

    it('lists the most recently released models first', () => {
        const { container, dispose } = mount([
            model('anthropic/claude-haiku-4-5', true, Date.parse('2025-10-01')),
            model('anthropic/claude-opus-5', true, Date.parse('2026-04-01'))
        ]);
        try {
            expect(labels(container)).to.deep.equal(['claude-opus-5', 'claude-haiku-4-5']);
        } finally {
            dispose();
        }
    });

    it('falls back to alphabetical order for a provider that reports no release dates', () => {
        const { container, dispose } = mount([model('google/gemini-3.7-flash'), model('google/gemini-3.1-pro')]);
        try {
            expect(labels(container)).to.deep.equal(['gemini-3.1-pro', 'gemini-3.7-flash']);
        } finally {
            dispose();
        }
    });

    it('heads every row with the id and puts the reported name beneath it', () => {
        const discovered: DiscoveredModel[] = [{ id: 'claude-opus-5', label: 'Claude Opus 5' }];
        const { container, dispose } = mount([model('anthropic/claude-opus-5')], status({ discovered }));
        try {
            expect(labels(container)).to.deep.equal(['claude-opus-5']);
            expect(container.querySelector('.ai-configuration-item-row-description')?.textContent).to.equal('Claude Opus 5');
        } finally {
            dispose();
        }
    });

    it('appends the reported description to the reported name', () => {
        const discovered: DiscoveredModel[] = [{ id: 'gemini-3-pro', label: 'Gemini 3 Pro', description: 'The best one.' }];
        const { container, dispose } = mount([model('google/gemini-3-pro')], status({ providerId: 'google', discovered }));
        try {
            expect(container.querySelector('.ai-configuration-item-row-description')?.textContent).to.equal('Gemini 3 Pro · The best one.');
        } finally {
            dispose();
        }
    });

    it('keeps the same row shape for a provider that reports nothing but the id', () => {
        const { container, dispose } = mount([model('openai/gpt-5.6-sol')], status({ providerId: 'openAiOfficial', modelIdPrefix: 'openai' }));
        try {
            const row = container.querySelector('.ai-configuration-item-row-label')!;
            expect(row.textContent).to.equal('gpt-5.6-sol');
            // Same heading as a provider that does report a name, just without the second line.
            expect(row.className.split(/\s+/)).to.not.include('mono');
            expect(container.querySelector('.ai-configuration-item-row-description')).to.equal(null); // eslint-disable-line no-null/no-null
        } finally {
            dispose();
        }
    });

    it('badges only the models that are not ready, since a listed model is ready by construction', () => {
        const { container, dispose } = mount([model('anthropic/claude-opus-5'), model('anthropic/claude-haiku-4-5', false)]);
        try {
            const badges = [...container.querySelectorAll('.ai-configuration-item-row .ai-configuration-status-badge-label')];
            expect(badges.map(badge => badge.textContent)).to.deep.equal(['Not ready']);
        } finally {
            dispose();
        }
    });

    it('offers no filter for a short list', () => {
        const { container, dispose } = mount([model('anthropic/claude-opus-5')]);
        try {
            expect(container.querySelector('.ai-configuration-filter-input')).to.equal(null); // eslint-disable-line no-null/no-null
        } finally {
            dispose();
        }
    });

    it('filters a long list by id', () => {
        const models = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(suffix => model(`openai/gpt-${suffix}`));
        const { container, dispose } = mount(models);
        try {
            expect(labels(container)).to.have.lengthOf(9);
            typeIntoFilter(container, 'gpt-c');
            expect(labels(container)).to.deep.equal(['gpt-c']);
            typeIntoFilter(container, 'nothing-matches');
            expect(labels(container)).to.be.empty;
            expect(container.querySelector('.ai-configuration-empty-state')).to.not.equal(null); // eslint-disable-line no-null/no-null
        } finally {
            dispose();
        }
    });

    it('keeps the models listed when a refresh failed, above the failure callout', () => {
        const { container, dispose } = mount([model('anthropic/claude-opus-5')], status({ state: 'error', message: 'offline' }));
        try {
            expect(container.querySelector('.ai-configuration-callout-text')?.textContent).to.equal('offline');
            expect(labels(container)).to.deep.equal(['claude-opus-5']);
        } finally {
            dispose();
        }
    });

    it('states that the list is configured manually when the models are overridden', () => {
        const { container, dispose } = mount(
            [model('anthropic/claude-opus-5')],
            status({ state: 'overridden', message: 'The model list is configured manually.' })
        );
        try {
            expect(container.querySelector('.ai-configuration-section-subtitle')?.textContent).to.equal('The model list is configured manually.');
            expect(labels(container)).to.deep.equal(['claude-opus-5']);
            const badges = [...container.querySelectorAll('.ai-configuration-status-badge-label')].map(badge => badge.textContent);
            expect(badges).to.include('Manual');
        } finally {
            dispose();
        }
    });

    it('names the release date of the models that report one, which is what the order follows', () => {
        const { container, dispose } = mount([
            model('anthropic/claude-opus-5', true, Date.parse('2026-04-01')),
            model('anthropic/claude-undated')
        ]);
        try {
            const details = [...container.querySelectorAll('.ai-configuration-item-row-detail')];
            // Only the model with a reported date carries one; the other row simply has no trailing detail.
            expect(details).to.have.lengthOf(1);
            expect(details[0].textContent).to.match(/^released /);
        } finally {
            dispose();
        }
    });

    it('checks a featured model and does not let it be unchecked', () => {
        const favorites = favoritesStub(['anthropic/claude-opus-5']);
        const { container, dispose } = mount([model('anthropic/claude-opus-5')], status(), favorites);
        try {
            const shown = container.querySelector<HTMLButtonElement>('.ai-configuration-item-row-trailing .ai-configuration-icon-button')!;
            expect(shown.querySelector('.codicon-pass')).to.not.equal(null); // eslint-disable-line no-null/no-null
            expect(shown.disabled).to.equal(true);
            // The tooltip carries the locked state and the scope, so it has to name both.
            expect(shown.title).to.contain('Always shown');
            expect(shown.title).to.contain('AI chat input');
        } finally {
            dispose();
        }
    });

    it('shows an empty circle on a model the chat input hides, and checks it on click', () => {
        const favorites = favoritesStub();
        const { container, dispose } = mount([model('anthropic/claude-opus-5-20260401')], status(), favorites);
        try {
            const shown = container.querySelector<HTMLButtonElement>('.ai-configuration-item-row-trailing .ai-configuration-icon-button')!;
            expect(shown.querySelector('.codicon-circle-large')).to.not.equal(null); // eslint-disable-line no-null/no-null
            expect(shown.title).to.contain('AI chat input');
            expect(shown.disabled).to.equal(false);
            flushSync(() => shown.click());
            expect((favorites as unknown as { toggled: string[] }).toggled).to.deep.equal(['anthropic/claude-opus-5-20260401']);
        } finally {
            dispose();
        }
    });

    it('states once, above the list, that this is about the chat input', () => {
        const { container, dispose } = mount([model('anthropic/claude-opus-5')]);
        try {
            expect(container.querySelector('.ai-configuration-section-subtitle')?.textContent).to.contain('AI chat input');
        } finally {
            dispose();
        }
    });

    it('filters the list down to the offered models on request', () => {
        const models = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map(suffix => model(`openai/gpt-${suffix}`));
        const { container, dispose } = mount(models, status({ providerId: 'openAiOfficial', modelIdPrefix: 'openai' }), favoritesStub(['openai/gpt-c']));
        try {
            expect(labels(container)).to.have.lengthOf(9);
            // The narrowing sits in the filter box, next to the clear button.
            const toggle = container.querySelector<HTMLButtonElement>('.ai-configuration-filter-input-action')!;
            flushSync(() => toggle.click());
            expect(labels(container)).to.deep.equal(['gpt-c']);
        } finally {
            dispose();
        }
    });

    it('offers the command a provider names for its missing credential, e.g. signing in to Copilot', () => {
        const actions: ModelDiscoveryAction[] = [];
        const { container, dispose } = mount(
            [],
            status({
                providerId: 'copilot',
                state: 'no-credentials',
                message: 'Not signed in to GitHub Copilot. Sign in to discover the models it offers.',
                action: { label: 'Sign in to GitHub Copilot', commandId: 'copilot.signIn' }
            }),
            favoritesStub(),
            actions
        );
        try {
            const button = container.querySelector<HTMLButtonElement>('.ai-configuration-empty-state-action button')!;
            expect(button.textContent).to.equal('Sign in to GitHub Copilot');
            flushSync(() => button.click());
            expect(actions.map(action => action.commandId)).to.deep.equal(['copilot.signIn']);
        } finally {
            dispose();
        }
    });

    it('disables the refresh while there is no credential to fetch with, and says why', () => {
        const { container, dispose } = mount([], status({ state: 'no-credentials', message: 'No Anthropic API key set.' }));
        try {
            const refresh = container.querySelector<HTMLButtonElement>('.ai-configuration-section-title-actions .ai-configuration-icon-button')!;
            expect(refresh.disabled).to.equal(true);
            expect(refresh.title).to.equal('No Anthropic API key set.');
        } finally {
            dispose();
        }
    });

    it('lets a provider name the state itself, since a sign-in is not an API key', () => {
        const { container, dispose } = mount([], status({
            providerId: 'copilot',
            state: 'no-credentials',
            stateLabel: 'Not signed in',
            message: 'Not signed in to GitHub Copilot. Sign in to discover the models it offers.'
        }));
        try {
            const badge = container.querySelector('.ai-configuration-status-badge-label')!;
            expect(badge.textContent).to.equal('Not signed in');
        } finally {
            dispose();
        }
    });

    it('shows the key call to action instead of a list while there are no credentials', () => {
        const { container, dispose } = mount([], status({ state: 'no-credentials', message: 'No Anthropic API key set.' }));
        try {
            expect(container.querySelector('.ai-configuration-empty-state-message')?.textContent).to.equal('No Anthropic API key set.');
            expect(labels(container)).to.be.empty;
        } finally {
            dispose();
        }
    });
});
