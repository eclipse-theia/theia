// *****************************************************************************
// Copyright (C) 2024 EclipseSource GmbH.
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

export const API_KEY_PREF = 'ai-features.huggingFace.apiKey';
export const MODELS_PREF = 'ai-features.huggingFace.models';

export const HuggingFacePreferencesSchema: PreferenceSchema = {
    properties: {
        [API_KEY_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/huggingFace/apiKey/mdDescription',
                'Enter an API Key for your Hugging Face Account. **Please note:** By using this preference the Hugging Face API key will be stored in clear text\
            on the machine running Theia. Use the environment variable `HUGGINGFACE_API_KEY` to set the key securely.'),
            title: AI_CORE_PREFERENCES_TITLE,
            tags: ['experimental']
        },
        [MODELS_PREF]: {
            type: 'array',
            markdownDescription: nls.localize('theia/ai/huggingFace/models/mdDescription',
                'Hugging Face models to use. **Please note:** Only models supporting the chat completion API are supported \
            (instruction-tuned models like `*-Instruct`) currently. Some models may require accepting license terms on the Hugging Face website.'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: ['meta-llama/Llama-3.2-3B-Instruct', 'meta-llama/Llama-3.1-8B-Instruct'],
            items: {
                type: 'string'
            },
            tags: ['experimental']
        }
    }
};
