// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/common/ai-core-preferences';
import { nls, PreferenceSchema } from '@theia/core';

export const CODEX_API_KEY_PREF = 'ai-features.codex.apiKey';

export const CodexPreferencesSchema: PreferenceSchema = {
    properties: {
        [CODEX_API_KEY_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/codex/apiKey/description',
                'OpenAI API key for Codex. If not set, falls back to the shared OpenAI API key (`ai-features.openAiOfficial.openAiApiKey`). ' +
                'Can also be set via `OPENAI_API_KEY` environment variable.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
    }
};
