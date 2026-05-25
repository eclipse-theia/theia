// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/common/ai-core-preferences';
import { LINUX_ENV_HINT, nls, PreferenceSchema } from '@theia/core';
import { NVIDIA_FREE_MODELS } from '../common/nvidia-models';

/** Default NVIDIA NIM endpoint. It is OpenAI Chat-Completions compatible. */
export const NVIDIA_DEFAULT_BASE_URL = 'https://integrate.api.nvidia.com/v1';

export const API_KEY_PREF = 'ai-features.nvidia.nvidiaApiKey';
export const BASE_URL_PREF = 'ai-features.nvidia.nvidiaBaseUrl';
export const MODELS_PREF = 'ai-features.nvidia.nvidiaModels';

/**
 * Curated set of models that NVIDIA NIM exposes for free via build.nvidia.com.
 * Users can add or remove entries from the preferences.
 */
export const NVIDIA_DEFAULT_MODELS: string[] = [...NVIDIA_FREE_MODELS];

export const NvidiaPreferencesSchema: PreferenceSchema = {
    properties: {
        [API_KEY_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/nvidia/apiKey/mdDescription',
                'Enter an API Key for your NVIDIA account. You can create a free key at [build.nvidia.com](https://build.nvidia.com), \
which grants free credits to use the hosted models. **Please note:** By using this preference the NVIDIA API key will be stored in clear text \
on the machine running Theia.') + LINUX_ENV_HINT,
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [BASE_URL_PREF]: {
            type: 'string',
            default: NVIDIA_DEFAULT_BASE_URL,
            markdownDescription: nls.localize('theia/ai/nvidia/baseUrl/mdDescription',
                'The OpenAI-compatible endpoint where the NVIDIA models are hosted. Defaults to the public NVIDIA NIM endpoint. \
Change this only if you self-host NVIDIA NIM.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [MODELS_PREF]: {
            type: 'array',
            description: nls.localize('theia/ai/nvidia/models/description', 'NVIDIA NIM models to use'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: NVIDIA_DEFAULT_MODELS,
            items: {
                type: 'string'
            }
        }
    }
};
