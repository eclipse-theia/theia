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
import { SelectOption } from '@theia/core/lib/browser/widgets/select-component';
import { AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';
import { AiConfigurationCategoryId } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { GeneralConfigurationCategory } from './general-configuration-category';

disableJSDOM();

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

    before(() => disableJSDOM = enableJSDOM());
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
});
