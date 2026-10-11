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

// @lumino/dragdrop (pulled in transitively via the file dialog service) extends the DragEvent DOM
// global at module load, which JSDOM does not provide; stub it so the import succeeds.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(global as any).DragEvent) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).DragEvent = class DragEvent extends (global as any).Event { };
}

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { createRoot } from '@theia/core/shared/react-dom/client';
import { flushSync } from '@theia/core/shared/react-dom';
import { SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AiConfigurationCategoryId, AiConfigurationRenderContext } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { PREFERENCE_NAME_ENABLE_AI } from '../../../common/ai-ide-preferences';
import { GeneralConfigurationCategory } from './general-configuration-category';

disableJSDOM();

/** A preference id no category claims, so it renders through the General catch-all. */
const UNCLAIMED_PREF = 'ai-features.codeCompletion.enabled';

/**
 * A category whose stub service is complete enough to render the whole page, so the tests can assert on
 * the produced DOM rather than only on the render inputs.
 */
function createRenderableCategory(enabled: boolean): GeneralConfigurationCategory {
    const category = new GeneralConfigurationCategory();
    const values: Record<string, unknown> = { [PREFERENCE_NAME_ENABLE_AI]: enabled };
    const service: Partial<AiSettingsRowService> = {
        inspect: (preferenceId: string) => ({
            value: values[preferenceId],
            scopeValue: values[preferenceId],
            defaultValue: undefined,
            modified: false
        }),
        describe: (preferenceId: string) => ({ label: `label:${preferenceId}`, description: `description:${preferenceId}` }),
        tags: (): string[] => [],
        renderMarkdown: (markdown: string) => {
            const element = document.createElement('span');
            element.textContent = markdown;
            return element;
        },
        controlFor: () => ({ type: 'boolean' }),
        enumOptions: (): SelectOption[] => [],
        aiFeaturePreferenceIds: (): string[] => [UNCLAIMED_PREF]
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).settingsRowService = service;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).categoryRegistry = { getCategories: () => [] };
    return category;
}

/** Renders the category's page into a detached container; the caller disposes it. */
function renderPage(category: GeneralConfigurationCategory): { container: HTMLElement; dispose: () => void } {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const ctx: AiConfigurationRenderContext = { scope: 'user', navigate: () => { }, update: () => { } };
    flushSync(() => root.render(category.renderPage(ctx)));
    return {
        container,
        dispose: () => {
            flushSync(() => root.unmount());
            container.remove();
        }
    };
}

/** A stub settings-row service that echoes the preference id as its label and declares no enums. */
function createCategory(): GeneralConfigurationCategory {
    const category = new GeneralConfigurationCategory();
    const service: Partial<AiSettingsRowService> = {
        describe: (preferenceId: string) => ({ label: `label:${preferenceId}` }),
        enumOptions: (): SelectOption[] => [],
        // No unclaimed preferences in this stub, so the catch-all contributes nothing.
        aiFeaturePreferenceIds: (): string[] => []
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).settingsRowService = service;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (category as any).categoryRegistry = { getCategories: () => [] };
    return category;
}

describe('GeneralConfigurationCategory', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
        // The config is stored on `window`, which the line above replaces, so the module-level `set` no
        // longer applies. The hero reads `applicationName` from it while rendering.
        try {
            FrontendApplicationConfigProvider.get();
        } catch {
            FrontendApplicationConfigProvider.set({});
        }
    });
    after(() => disableJSDOM());

    it('declares the general single-page metadata', () => {
        const category = createCategory();
        expect(category.id).to.equal(AiConfigurationCategoryId.GENERAL);
        expect(category.kind).to.equal('single-page');
        expect(category.renderer).to.equal(category);
        expect(category.search).to.equal(category);
    });

    it('the catch-all surfaces every ai-features preference that no category claims (nothing is lost from the view)', () => {
        const category = new GeneralConfigurationCategory();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).settingsRowService = {
            aiFeaturePreferenceIds: (): string[] => ['ai-features.chat.a', 'ai-features.foo.b', 'ai-features.bar.c']
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (category as any).categoryRegistry = {
            getCategories: () => [
                { renderer: { getOwnedPreferenceIds: () => ['ai-features.foo.b'] } },
                { renderer: {} } // a category that owns nothing
            ]
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const unclaimed = (category as any).unclaimedPreferenceIds() as string[];
        expect([...unclaimed].sort()).to.deep.equal(['ai-features.bar.c', 'ai-features.chat.a']);
    });

    it('indexes one search item per setting, deep-linking to the row', () => {
        const category = createCategory();
        const items = category.getSearchItems();
        // master toggle (hero) + Chat (5)
        expect(items).to.have.lengthOf(6);
        const enableAi = items.find(item => item.keywords?.startsWith('ai-features.AiEnable.enableAI'));
        expect(enableAi).to.not.equal(undefined);
        // The master toggle authors its own title, so it does not fall back to the schema label.
        expect(enableAi!.label).to.equal('Enable AI features');
        expect(enableAi!.target).to.deep.equal({
            categoryId: AiConfigurationCategoryId.GENERAL,
            highlight: { rowId: 'ai-features.AiEnable.enableAI' }
        });
    });

    describe('rendered page', () => {

        it('anchors every row its search index deep-links to', () => {
            // The two halves of a deep link are produced independently: `getSearchItems` names a `rowId`
            // and the page has to emit a matching `data-ai-config-row-id`. Nothing else ties them together,
            // so a row indexed but not anchored (as the hero toggle was) silently never scrolls or flashes.
            const category = createRenderableCategory(true);
            const { container, dispose } = renderPage(category);
            try {
                const anchored = new Set(Array.from(container.querySelectorAll('[data-ai-config-row-id]'))
                    .map(element => element.getAttribute('data-ai-config-row-id')));
                const deepLinked = category.getSearchItems()
                    .map(item => item.target.highlight?.rowId)
                    .filter((rowId): rowId is string => rowId !== undefined);
                expect(deepLinked, 'the search index deep-links to no rows at all').to.not.be.empty;
                const unanchored = deepLinked.filter(rowId => !anchored.has(rowId));
                expect(unanchored, `search items deep-link to rows the page never anchors: ${unanchored.join(', ')}`).to.be.empty;
            } finally {
                dispose();
            }
        });

        it('does not print the raw preference id next to the hero title', () => {
            const category = createRenderableCategory(true);
            const { container, dispose } = renderPage(category);
            try {
                const title = container.querySelector('.ai-configuration-hero .ai-settings-row-title');
                expect(title, 'the hero renders no title').to.exist;
                expect(title!.textContent).to.not.contain('ai-features.');
            } finally {
                dispose();
            }
        });

        it('renders the catch-all rows read-only while AI features are off', () => {
            // The gate note promises the settings below take effect once AI is enabled, so they must not be
            // editable meanwhile. The catch-all rows are generated, so they do not inherit the hand-authored
            // rows' `disabled` state unless it is plumbed through `AiSettingsRow`.
            const off = createRenderableCategory(false);
            const rendered = renderPage(off);
            try {
                const control = rendered.container.querySelector<HTMLInputElement>(`[data-ai-config-row-id="${UNCLAIMED_PREF}"] input`);
                expect(control, 'the catch-all row renders no control').to.exist;
                expect(control!.disabled).to.equal(true);
            } finally {
                rendered.dispose();
            }
        });

        it('renders the catch-all rows editable once AI features are on', () => {
            const on = createRenderableCategory(true);
            const rendered = renderPage(on);
            try {
                const control = rendered.container.querySelector<HTMLInputElement>(`[data-ai-config-row-id="${UNCLAIMED_PREF}"] input`);
                expect(control, 'the catch-all row renders no control').to.exist;
                expect(control!.disabled).to.equal(false);
            } finally {
                rendered.dispose();
            }
        });
    });
});
