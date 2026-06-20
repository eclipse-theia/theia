// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { ReasoningSupport } from '@theia/ai-core';
import { DeveloperMessageSettings } from './openai-language-model';

/**
 * Per-model defaults inferred from the OpenAI model id. Sourced from
 * https://developers.openai.com/api/docs/models. The `/v1/models/{id}` endpoint does not expose
 * this data, so it is maintained client-side. User overrides on the model description take
 * precedence over these values.
 */
export interface OpenAiModelDefaults {
    contextWindow?: number;
    reasoningSupport?: ReasoningSupport;
    developerMessageSettings?: DeveloperMessageSettings;
    supportsStructuredOutput?: boolean;
    supportsStreaming?: boolean;
}

const GPT5_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'minimal', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

const O_SERIES_REASONING_SUPPORT: ReasoningSupport = {
    supportedLevels: ['off', 'low', 'medium', 'high', 'auto'],
    defaultLevel: 'auto'
};

/**
 * First matching prefix wins, so more specific prefixes must come before broader ones
 * (e.g. `gpt-5.4-mini` before `gpt-5.4`). Snapshots inherit their family value
 * (e.g. `gpt-4o-2024-08-06` matches `gpt-4o`).
 */
const OPENAI_MODEL_FAMILIES: ReadonlyArray<readonly [prefix: string, defaults: OpenAiModelDefaults]> = [
    ['gpt-5.5', { contextWindow: 1_050_000, reasoningSupport: GPT5_REASONING_SUPPORT }],
    ['gpt-5.4-mini', { contextWindow: 400_000, reasoningSupport: GPT5_REASONING_SUPPORT }],
    ['gpt-5.4-nano', { contextWindow: 400_000, reasoningSupport: GPT5_REASONING_SUPPORT }],
    ['gpt-5.4', { contextWindow: 1_050_000, reasoningSupport: GPT5_REASONING_SUPPORT }],
    ['gpt-5', { contextWindow: 400_000, reasoningSupport: GPT5_REASONING_SUPPORT }],
    ['gpt-4.1', { contextWindow: 1_047_576 }],
    // gpt-4o-2024-05-13 predates structured output support; later snapshots support it.
    ['gpt-4o-2024-05-13', { contextWindow: 128_000, supportsStructuredOutput: false }],
    ['gpt-4o', { contextWindow: 128_000 }],
    ['gpt-4-turbo', { contextWindow: 128_000, supportsStructuredOutput: false }],
    ['gpt-4-32k', { contextWindow: 32_768, supportsStructuredOutput: false }],
    ['gpt-4', { contextWindow: 8_192, supportsStructuredOutput: false }],
    ['gpt-3.5', { contextWindow: 16_385, supportsStructuredOutput: false }],
    ['o4', { contextWindow: 200_000, reasoningSupport: O_SERIES_REASONING_SUPPORT }],
    ['o3', { contextWindow: 200_000, reasoningSupport: O_SERIES_REASONING_SUPPORT }],
    ['o1-preview', {
        contextWindow: 128_000,
        reasoningSupport: O_SERIES_REASONING_SUPPORT,
        developerMessageSettings: 'user',
        supportsStructuredOutput: false
    }],
    ['o1-mini', {
        contextWindow: 128_000,
        reasoningSupport: O_SERIES_REASONING_SUPPORT,
        developerMessageSettings: 'user',
        supportsStructuredOutput: false
    }],
    ['o1', { contextWindow: 200_000, reasoningSupport: O_SERIES_REASONING_SUPPORT }],
];

export function getOpenAiModelDefaults(model: string): OpenAiModelDefaults {
    return OPENAI_MODEL_FAMILIES.find(([prefix]) => model.startsWith(prefix))?.[1] ?? {};
}
