// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { AI_CORE_PREFERENCES_TITLE } from '@theia/ai-core/lib/common/ai-core-preferences';
import { LINUX_ENV_HINT, nls, PreferenceSchema } from '@theia/core';
import { OPENROUTER_DEFAULT_FREE_MODELS } from '../common/openrouter-models';

/** Default OpenRouter endpoint. It is OpenAI Chat-Completions compatible. */
export const OPENROUTER_DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';

export const API_KEY_PREF = 'ai-features.openrouter.openrouterApiKey';
export const BASE_URL_PREF = 'ai-features.openrouter.openrouterBaseUrl';
export const MODELS_PREF = 'ai-features.openrouter.openrouterModels';

/**
 * Defaults to the curated `:free` models. Users typically add paid OpenRouter models
 * (e.g. `anthropic/claude-3.5-sonnet`) by editing the preference manually.
 */
export const OPENROUTER_DEFAULT_MODELS: string[] = [...OPENROUTER_DEFAULT_FREE_MODELS];

export const OpenRouterPreferencesSchema: PreferenceSchema = {
    properties: {
        [API_KEY_PREF]: {
            type: 'string',
            markdownDescription: nls.localize('theia/ai/openrouter/apiKey/mdDescription',
                'Enter an API Key for your OpenRouter account. You can create a free key at [openrouter.ai/keys](https://openrouter.ai/keys). \
With a free account you can use any model whose slug ends with `:free` at no cost (shared rate limit ~20 req/min, 200 req/day). \
Paid models pay-per-token from the same key. \
**Please note:** By using this preference the OpenRouter API key will be stored in clear text \
on the machine running Theia.') + LINUX_ENV_HINT,
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [BASE_URL_PREF]: {
            type: 'string',
            default: OPENROUTER_DEFAULT_BASE_URL,
            markdownDescription: nls.localize('theia/ai/openrouter/baseUrl/mdDescription',
                'The OpenAI-compatible endpoint where OpenRouter hosts its model gateway. Defaults to the public OpenRouter endpoint. \
Change this only if you proxy OpenRouter through your own gateway.'),
            title: AI_CORE_PREFERENCES_TITLE,
        },
        [MODELS_PREF]: {
            type: 'array',
            markdownDescription: nls.localize('theia/ai/openrouter/models/mdDescription',
                'OpenRouter models to register. Each entry is the OpenRouter slug, e.g. `meta-llama/llama-3.3-70b-instruct:free` (free tier) \
or `anthropic/claude-3.5-sonnet` (paid). Browse the full catalog at [openrouter.ai/models](https://openrouter.ai/models). \
Models whose slug ends with `:free` are marked with the 🆓 badge automatically.'),
            title: AI_CORE_PREFERENCES_TITLE,
            default: OPENROUTER_DEFAULT_MODELS,
            items: {
                type: 'string'
            }
        }
    }
};
