// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapQaiqModelOption } from './qaap-agent-task-client';
import {
    listByokModelsFromDescriptor,
    parseTheiaLanguageModelId,
    QAAP_QAIQ_BYOK_PROVIDERS,
    type QaapPreferenceReader,
    vendorHasByokCredential,
} from './qaap-qaiq-byok-provider-registry';

export type { QaapPreferenceReader } from './qaap-qaiq-byok-provider-registry';
export { formatQaiqModelProviderLabel } from './qaap-qaiq-byok-provider-registry';

type AliasMap = Record<string, { readonly selectedModel?: string } | undefined>;

const ALIAS_KEYS = ['default/code', 'default/universal', 'default/code-completion', 'default/summarize'] as const;

/** Models available for QAIQ from Settings (API keys + model lists + aliases). */
export function listQaiqModelsFromPreferences(readPref: QaapPreferenceReader): QaapQaiqModelOption[] {
    const deduped = new Map<string, QaapQaiqModelOption>();

    const add = (option: QaapQaiqModelOption): void => {
        if (!vendorHasByokCredential(readPref, option.vendor)) {
            return;
        }
        const key = `${option.provider}|${option.vendor}|${option.modelId}`;
        if (!deduped.has(key)) {
            deduped.set(key, option);
        }
    };

    const aliases = readPref('ai-features.languageModelAliases') as AliasMap | undefined;
    if (aliases && typeof aliases === 'object') {
        for (const key of ALIAS_KEYS) {
            const binding = parseTheiaLanguageModelId(aliases[key]?.selectedModel);
            if (binding) {
                add(binding);
            }
        }
        for (const entry of Object.values(aliases)) {
            const binding = parseTheiaLanguageModelId(entry?.selectedModel);
            if (binding) {
                add(binding);
            }
        }
    }

    for (const provider of QAAP_QAIQ_BYOK_PROVIDERS) {
        for (const model of listByokModelsFromDescriptor(readPref, provider)) {
            add(model);
        }
    }

    return [...deduped.values()];
}

export function groupQaiqModelsByProvider(models: readonly QaapQaiqModelOption[]): Map<string, QaapQaiqModelOption[]> {
    const grouped = new Map<string, QaapQaiqModelOption[]>();
    for (const model of models) {
        const provider = model.vendor || model.provider;
        const list = grouped.get(provider) ?? [];
        list.push(model);
        grouped.set(provider, list);
    }
    return grouped;
}
