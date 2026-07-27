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
import { PreferenceDataProperty, PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { HideAiPreferencesContribution, OPEN_AI_CONFIGURATION_PREFERENCE_ID } from './hide-ai-preferences-contribution';

describe('HideAiPreferencesContribution', () => {

    it('hides every ai-features.* preference from the Settings UI, keeping non-AI ones and leaving the AI Configuration view unaffected', async () => {
        const properties = new Map<string, PreferenceDataProperty>([
            ['ai-features.chat.tokenUsageIndicator.enabled', { type: 'boolean' }],
            ['ai-features.anthropic.apiKey', { type: 'string' }],
            // The redirect placeholder that links to the view stays visible in Settings.
            [OPEN_AI_CONFIGURATION_PREFERENCE_ID, { type: 'null' }],
            // Already hidden: left as-is (not re-updated).
            ['ai-features.mcp.mcpServers', { type: 'object', hidden: true }],
            // Non-AI preference: untouched.
            ['editor.fontSize', { type: 'number' }]
        ]);
        const updated = new Map<string, PreferenceDataProperty>();
        const service: Partial<PreferenceSchemaService> = {
            getSchemaProperties: () => properties,
            updateSchemaProperty: (key, property) => { updated.set(key, property); }
        };

        await new HideAiPreferencesContribution().initSchema(service as PreferenceSchemaService);

        // Exactly the not-yet-hidden AI preferences are hidden — never the redirect placeholder or non-AI ones.
        expect([...updated.keys()].sort()).to.deep.equal(['ai-features.anthropic.apiKey', 'ai-features.chat.tokenUsageIndicator.enabled']);
        expect([...updated.values()].every(property => property.hidden === true)).to.equal(true);
    });
});
