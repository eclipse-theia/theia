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

import { injectable } from '@theia/core/shared/inversify';
import { nls, PreferenceContribution, PreferenceSchema, PreferenceSchemaService } from '@theia/core';
import { AI_CORE_PREFERENCES_TITLE } from '../common/ai-core-preferences';

/** Prefix shared by all AI preferences. */
const AI_PREFERENCE_PREFIX = 'ai-features.';

/**
 * Informational placeholder shown in the Settings UI where the AI preferences used to live. It is a
 * `null`-type preference (no editable value) grouped under "AI Features"; `@theia/ai-ide` renders it
 * with a button that opens the AI Configuration view. Excluded from the hiding pass below.
 */
export const OPEN_AI_CONFIGURATION_PREFERENCE_ID = 'ai-features.openConfiguration';

export const openAiConfigurationPlaceholderSchema: PreferenceSchema = {
    properties: {
        [OPEN_AI_CONFIGURATION_PREFERENCE_ID]: {
            // eslint-disable-next-line no-null/no-null
            type: 'null',
            title: AI_CORE_PREFERENCES_TITLE,
            markdownDescription: nls.localize('theia/ai-core/openConfiguration/description',
                'AI settings have moved to the AI Configuration view. Open it to configure providers, models, agents, and more.')
        }
    }
};

/**
 * Hides all AI preferences (`ai-features.*`) from the Settings UI once the AI Configuration view
 * covers them (eclipsesource/theia#316). The schemas stay registered so validation and typing are
 * unaffected; only their Settings-UI visibility is turned off via `hidden: true`. Matching by prefix
 * means any future AI preference is covered without per-schema maintenance.
 */
@injectable()
export class HideAiPreferencesContribution implements PreferenceContribution {

    async initSchema(service: PreferenceSchemaService): Promise<void> {
        // Defer until the synchronous contribution-registration loop has added every schema, so we
        // see all AI preferences (including those from provider packages) in a single pass.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
        for (const [key, property] of service.getSchemaProperties()) {
            if (key.startsWith(AI_PREFERENCE_PREFIX) && key !== OPEN_AI_CONFIGURATION_PREFERENCE_ID && !property.hidden) {
                service.updateSchemaProperty(key, { ...property, hidden: true });
            }
        }
    }
}
