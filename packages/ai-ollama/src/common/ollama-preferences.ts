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

import { AI_CORE_PREFERENCES_TITLE, MODEL_PROVIDER_TYPE_DETAIL, ModelProviderTypeDetail } from '@theia/ai-core/lib/common/ai-core-preferences';
import { nls } from '@theia/core';
import { PreferenceSchema } from '@theia/core/lib/common';

export const HOST_PREF = 'ai-features.ollama.ollamaHost';
export const MODELS_PREF = 'ai-features.ollama.ollamaModels';
export const REQUEST_TIMEOUT_PREF = 'ai-features.ollama.requestTimeout';

export const OllamaPreferencesSchema: PreferenceSchema = {
    properties: {
        [HOST_PREF]: {
            type: 'string',
            typeDetails: { [MODEL_PROVIDER_TYPE_DETAIL]: { label: 'Ollama' } satisfies ModelProviderTypeDetail },
            title: AI_CORE_PREFERENCES_TITLE,
            default: 'http://localhost:11434'
        },
        [MODELS_PREF]: {
            type: 'array',
            title: AI_CORE_PREFERENCES_TITLE,
            default: [],
            items: {
                type: 'string'
            }
        },
        [REQUEST_TIMEOUT_PREF]: {
            type: 'number',
            title: AI_CORE_PREFERENCES_TITLE,
            default: 0,
            minimum: 0,
            description: nls.localize('theia/ai/ollama/requestTimeout/description',
                'The request timeout (in milliseconds) for requests to the Ollama server. This is applied as the underlying connection\'s header and body '
                + 'timeout. Large local models can take a long time to load before producing their first response, which may exceed the default network '
                + 'timeout and surface as a "fetch failed" / "Could not reach the AI provider" error. Increase this value, or set it to `0` to disable '
                + 'the timeout entirely (recommended for large models).')
        }
    }
};
