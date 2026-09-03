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
export const AI_CONFIGURATION_OPEN_PREFERENCE_ID = 'ai-features.openConfiguration';

export const aiConfigurationOpenPlaceholderSchema: PreferenceSchema = {
    properties: {
        [AI_CONFIGURATION_OPEN_PREFERENCE_ID]: {
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

    /**
     * Re-entrancy guard: {@link PreferenceSchemaService.updateSchemaProperty} fires `onDidChangeSchema`
     * synchronously, so our own writes call {@link hideAiPreferences} back while it is still iterating
     * the service's live property map.
     */
    protected hiding = false;

    async initSchema(service: PreferenceSchemaService): Promise<void> {
        // Hide what is registered so far, then stay subscribed: schemas contributed after this point
        // (a contribution whose own `initSchema` awaits, or any runtime `addSchema`) would otherwise
        // remain visible in the Settings UI. Every addition fires `onDidChangeSchema`.
        this.hideAiPreferences(service);
        // Never disposed on purpose: this contribution lives as long as the application.
        service.onDidChangeSchema(() => this.hideAiPreferences(service));
    }

    /**
     * Turns on `hidden` for every `ai-features.*` property that is not already hidden. Idempotent, so it
     * can run on every schema change. The `hidden` check and {@link hiding} each independently stop our own
     * updates from looping; keep both, since dropping either leaves the pass one edit away from recursing.
     */
    protected hideAiPreferences(service: PreferenceSchemaService): void {
        if (this.hiding) {
            return;
        }
        this.hiding = true;
        try {
            for (const [key, property] of service.getSchemaProperties()) {
                if (key.startsWith(AI_PREFERENCE_PREFIX) && key !== AI_CONFIGURATION_OPEN_PREFERENCE_ID && !property.hidden) {
                    service.updateSchemaProperty(key, { ...property, hidden: true });
                }
            }
        } finally {
            this.hiding = false;
        }
    }
}
