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

// @lumino/dragdrop (pulled in transitively by the categories) extends the DragEvent DOM global at
// module load, which JSDOM does not provide; stub it so the imports succeed.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (!(global as any).DragEvent) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).DragEvent = class DragEvent extends (global as any).Event { };
}

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
// Mocha loads every spec into one process and `set` throws if called twice, so guard it.
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import { PreferenceSchema } from '@theia/core';
import { aiCorePreferenceSchema } from '@theia/ai-core/lib/common/ai-core-preferences';
import { AgentSettingsPreferenceSchema } from '@theia/ai-core/lib/common/agent-preferences';
import { aiChatPreferences } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { chatToolPreferences } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { shellCommandPreferences } from '@theia/ai-terminal/lib/common/shell-command-preferences';
import { aiIdePreferenceSchema } from '../../common/ai-ide-preferences';
import { GeneralConfigurationCategory } from './categories/general-configuration-category';
import { AgentsConfigurationCategory } from './categories/agents-configuration-category';
import { ToolsConfigurationCategory } from './categories/tools-configuration-category';
import { ModelAliasesConfigurationCategory } from './categories/model-aliases-configuration-category';
import { PromptsAndSkillsConfigurationCategory } from './categories/prompts-and-skills-configuration-category';

disableJSDOM();

/**
 * The schemas that declare the `ai-features.*` preferences the categories below claim. Kept explicit
 * rather than read from a live `PreferenceSchemaService`, so the check does not depend on DI.
 */
const SCHEMAS: PreferenceSchema[] = [
    aiCorePreferenceSchema,
    AgentSettingsPreferenceSchema,
    aiChatPreferences,
    chatToolPreferences,
    shellCommandPreferences,
    aiIdePreferenceSchema
];

/**
 * Categories with a statically declared ownership list. `ModelsConfigurationCategory` derives its ids
 * from the registered schema at runtime and `McpServersConfigurationCategory` lives in `@theia/ai-mcp`
 * (not a dependency of this package), so neither is covered here.
 */
function ownershipByCategory(): Map<string, string[]> {
    const categories = [
        new GeneralConfigurationCategory(),
        new AgentsConfigurationCategory(),
        new ToolsConfigurationCategory(),
        new ModelAliasesConfigurationCategory(),
        new PromptsAndSkillsConfigurationCategory()
    ];
    return new Map(categories.map(category => [category.id, category.getOwnedPreferenceIds()]));
}

describe('AI configuration preference ownership', () => {

    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    it('reads a non-empty schema and ownership set (guards the checks below against passing vacuously)', () => {
        const declared = SCHEMAS.flatMap(schema => Object.keys(schema.properties ?? {}));
        expect(declared).to.include('ai-features.AiEnable.enableAI');
        for (const [categoryId, ownedIds] of ownershipByCategory()) {
            expect(ownedIds, `${categoryId} declares no owned preference ids`).to.not.be.empty;
        }
    });

    it('claims only preference ids that a schema actually declares', () => {
        const declared = new Set(SCHEMAS.flatMap(schema => Object.keys(schema.properties ?? {})));
        const unknown: string[] = [];
        for (const [categoryId, ownedIds] of ownershipByCategory()) {
            for (const preferenceId of ownedIds) {
                if (!declared.has(preferenceId)) {
                    unknown.push(`${categoryId} -> ${preferenceId}`);
                }
            }
        }
        // A typo or a renamed preference makes the id unclaimed, so General's catch-all silently renders it
        // a second time. Nothing else fails, which is why this is worth asserting.
        expect(unknown, `categories claim preference ids that no schema declares: ${unknown.join(', ')}`).to.be.empty;
    });

    it('never lets two categories claim the same preference id', () => {
        const owners = new Map<string, string[]>();
        for (const [categoryId, ownedIds] of ownershipByCategory()) {
            for (const preferenceId of ownedIds) {
                owners.set(preferenceId, [...(owners.get(preferenceId) ?? []), categoryId]);
            }
        }
        const contested = [...owners.entries()]
            .filter(([, categoryIds]) => categoryIds.length > 1)
            .map(([preferenceId, categoryIds]) => `${preferenceId} (${categoryIds.join(', ')})`);
        expect(contested, `preference ids claimed more than once: ${contested.join(', ')}`).to.be.empty;
    });

    it('claims every id it renders as a row, so the General catch-all does not duplicate it', () => {
        // The ownership contract only holds if a category claims what it renders. Spot-check the two
        // categories whose rows are hand-authored (rather than derived from their ownership list).
        const general = new GeneralConfigurationCategory();
        const agents = new AgentsConfigurationCategory();
        const generalOwned = new Set(general.getOwnedPreferenceIds());
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const generalRendered = ((general as any).getSectionRefs() as { preferenceId: string }[]).map(ref => ref.preferenceId);
        const missing = generalRendered.filter(preferenceId => !generalOwned.has(preferenceId));
        expect(missing, `General renders rows it does not claim: ${missing.join(', ')}`).to.be.empty;
        // The agent page's own rows are covered by its ownership list too.
        expect(agents.getOwnedPreferenceIds()).to.include('ai-features.agentSettings');
    });
});
