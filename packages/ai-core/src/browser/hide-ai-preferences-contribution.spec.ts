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

import { expect } from 'chai';
import { Emitter } from '@theia/core';
import { PreferenceDataProperty, PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { HideAiPreferencesContribution, AI_CONFIGURATION_OPEN_PREFERENCE_ID } from './hide-ai-preferences-contribution';

interface TestService {
    readonly service: PreferenceSchemaService;
    /** Every key passed to `updateSchemaProperty`, in call order, so redundant writes are visible. */
    readonly updates: string[];
    /** Simulates a late `addSchema`: registers the property and fires `onDidChangeSchema` as the real service does. */
    addProperty(key: string, property: PreferenceDataProperty): void;
    isHidden(key: string): boolean | undefined;
}

/**
 * Stub of the parts of {@link PreferenceSchemaService} the contribution touches, faithful in the two ways
 * that matter here: `getSchemaProperties` hands out the live map, and `updateSchemaProperty` merges into it
 * and fires `onDidChangeSchema` synchronously.
 */
function createService(entries: [string, PreferenceDataProperty][]): TestService {
    const properties = new Map<string, PreferenceDataProperty>(entries);
    const schemaChanged = new Emitter<void>();
    const updates: string[] = [];
    const service: Partial<PreferenceSchemaService> = {
        getSchemaProperties: () => properties,
        updateSchemaProperty: (key, property) => {
            updates.push(key);
            properties.set(key, { ...properties.get(key), ...property });
            schemaChanged.fire();
        },
        onDidChangeSchema: schemaChanged.event
    };
    return {
        service: service as PreferenceSchemaService,
        updates,
        addProperty: (key, property) => {
            properties.set(key, property);
            schemaChanged.fire();
        },
        isHidden: key => properties.get(key)?.hidden
    };
}

describe('HideAiPreferencesContribution', () => {

    it('hides every ai-features.* preference from the Settings UI, keeping non-AI ones and leaving the AI Configuration view unaffected', async () => {
        const test = createService([
            ['ai-features.chat.tokenUsageIndicator.enabled', { type: 'boolean' }],
            ['ai-features.anthropic.apiKey', { type: 'string' }],
            // The redirect placeholder that links to the view stays visible in Settings.
            [AI_CONFIGURATION_OPEN_PREFERENCE_ID, { type: 'null' }],
            // Already hidden: left as-is (not re-updated).
            ['ai-features.mcp.mcpServers', { type: 'object', hidden: true }],
            // Non-AI preference: untouched.
            ['editor.fontSize', { type: 'number' }]
        ]);

        await new HideAiPreferencesContribution().initSchema(test.service);

        // Exactly the not-yet-hidden AI preferences are hidden — never the redirect placeholder or non-AI ones.
        expect([...test.updates].sort()).to.deep.equal(['ai-features.anthropic.apiKey', 'ai-features.chat.tokenUsageIndicator.enabled']);
        expect(test.isHidden('ai-features.anthropic.apiKey')).to.equal(true);
        expect(test.isHidden('ai-features.chat.tokenUsageIndicator.enabled')).to.equal(true);
        expect(test.isHidden(AI_CONFIGURATION_OPEN_PREFERENCE_ID)).to.equal(undefined);
        expect(test.isHidden('editor.fontSize')).to.equal(undefined);
    });

    it('hides ai-features.* preferences registered after the initial pass', async () => {
        const test = createService([['editor.fontSize', { type: 'number' }]]);
        await new HideAiPreferencesContribution().initSchema(test.service);
        expect(test.updates).to.be.empty;

        // A schema contributed later, e.g. by a contribution whose own `initSchema` awaited first.
        test.addProperty('ai-features.google.apiKey', { type: 'string' });

        expect(test.isHidden('ai-features.google.apiKey')).to.equal(true);
    });

    it('leaves the redirect placeholder visible when later schema changes retrigger the pass', async () => {
        const test = createService([[AI_CONFIGURATION_OPEN_PREFERENCE_ID, { type: 'null' }]]);
        await new HideAiPreferencesContribution().initSchema(test.service);

        test.addProperty('ai-features.openai.apiKey', { type: 'string' });

        expect(test.isHidden(AI_CONFIGURATION_OPEN_PREFERENCE_ID)).to.equal(undefined);
    });

    it('writes each preference once even though every update fires a schema change', async () => {
        const test = createService([
            ['ai-features.a', { type: 'string' }],
            ['ai-features.b', { type: 'string' }],
            ['ai-features.c', { type: 'string' }]
        ]);

        await new HideAiPreferencesContribution().initSchema(test.service);

        // Each write re-triggers the listener, so a non-idempotent pass would rewrite keys it already hid.
        expect(test.updates).to.have.lengthOf(3);
        expect([...test.updates].sort()).to.deep.equal(['ai-features.a', 'ai-features.b', 'ai-features.c']);
    });
});
