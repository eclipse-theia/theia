// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { PreferenceContribution, PreferenceSchema, PreferenceSchemaService } from '@theia/core/lib/common/preferences/preference-schema';
import { PreferenceScope } from '@theia/core/lib/common/preferences';
import { MODELS_PREF as ANTHROPIC_MODELS_PREF } from '@theia/ai-anthropic/lib/common/anthropic-preferences';
import { MODELS_PREF as GOOGLE_MODELS_PREF } from '@theia/ai-google/lib/common/google-preferences';

const ANTHROPIC_QAAP_MODELS = [
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-sonnet-4-5',
    'claude-opus-4-5'
];

const GOOGLE_QAAP_MODELS = [
    'gemini-3.1-pro-preview',
    'gemini-3-flash-preview'
];

@injectable()
export class QaapAiModelDefaultsContribution implements PreferenceContribution {
    schema: PreferenceSchema = { scope: PreferenceScope.Folder, properties: {} };

    async initSchema(service: PreferenceSchemaService): Promise<void> {
        service.registerOverride(ANTHROPIC_MODELS_PREF, undefined, ANTHROPIC_QAAP_MODELS);
        service.registerOverride(GOOGLE_MODELS_PREF, undefined, GOOGLE_QAAP_MODELS);
    }
}
