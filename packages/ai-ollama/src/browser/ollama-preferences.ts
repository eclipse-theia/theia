// *****************************************************************************
// Copyright (C) 2024 TypeFox GmbH.
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

import { PreferenceSchema } from '@theia/core/lib/browser/preferences/preference-contribution';
import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/browser/ai-core-preferences';

export const HOST_PREF = 'ai-features.ollama.ollamaHost';
export const MODELS_PREF = 'ai-features.ollama.ollamaModels';

export const OllamaPreferencesSchema: PreferenceSchema = {
    type: 'object',
    properties: {
        [HOST_PREF]: {
            type: 'string',
            title: AI_CORE_PREFERENCES_TITLE,
            default: 'http://localhost:11434'
        },
        [MODELS_PREF]: {
            type: 'array',
            title: AI_CORE_PREFERENCES_TITLE,
            default: ['llama3', 'gemma2'],
            items: {
                type: 'string'
            }
        }
    }
};
