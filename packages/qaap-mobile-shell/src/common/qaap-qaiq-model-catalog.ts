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
} from './qaap-qaiq-byok-provider-registry';

export type { QaapPreferenceReader } from './qaap-qaiq-byok-provider-registry';
export { formatQaiqModelProviderLabel } from './qaap-qaiq-byok-provider-registry';

type AliasMap = Record<string, { readonly selectedModel?: string } | undefined>;

const ALIAS_KEYS = ['default/code', 'default/universal', 'default/code-completion', 'default/summarize'] as const;

/** Subscription / gateway providers that must not appear in the QAIQ BYOK picker. */
export const QAAP_QAIQ_EXCLUDED_LANGUAGE_MODEL_PREFIXES = ['copilot/', 'vercel-ai/', 'vercel/'] as const;

export function isQaiqByokLanguageModelId(id: string): boolean {
    const normalized = id.trim().toLowerCase();
    if (!normalized) {
        return false;
    }
    return !QAAP_QAIQ_EXCLUDED_LANGUAGE_MODEL_PREFIXES.some(prefix => normalized.startsWith(prefix));
}

function qaiqModelOptionKey(option: QaapQaiqModelOption): string {
    return `${option.provider}|${option.vendor}|${option.modelId}`;
}

/** Union model lists (e.g. workspace snapshot + browser preferences) without duplicates. */
export function mergeQaiqModelOptions(
    ...sources: readonly (readonly QaapQaiqModelOption[])[]
): QaapQaiqModelOption[] {
    const deduped = new Map<string, QaapQaiqModelOption>();
    for (const models of sources) {
        for (const option of models) {
            const key = qaiqModelOptionKey(option);
            if (!deduped.has(key)) {
                deduped.set(key, option);
            }
        }
    }
    return [...deduped.values()];
}

/** Mirrors AI Configuration: every registered BYOK language model in the workbench. */
export function listQaiqModelsFromRegisteredLanguageModels(
    models: ReadonlyArray<{ readonly id: string; readonly name?: string }>,
): QaapQaiqModelOption[] {
    const deduped = new Map<string, QaapQaiqModelOption>();
    for (const model of models) {
        if (!isQaiqByokLanguageModelId(model.id)) {
            continue;
        }
        const binding = parseTheiaLanguageModelId(model.id);
        if (!binding) {
            continue;
        }
        const key = qaiqModelOptionKey(binding);
        if (!deduped.has(key)) {
            deduped.set(key, {
                ...binding,
                label: model.name?.trim() || binding.label || binding.modelId,
            });
        }
    }
    return [...deduped.values()];
}

/** Models available for QAIQ from Settings (API keys + model lists + aliases). */
export function listQaiqModelsFromPreferences(
    readPref: QaapPreferenceReader,
    readEnv?: (key: string) => string | undefined,
): QaapQaiqModelOption[] {
    const deduped = new Map<string, QaapQaiqModelOption>();

    const add = (option: QaapQaiqModelOption): void => {
        const key = qaiqModelOptionKey(option);
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
        for (const model of listByokModelsFromDescriptor(readPref, provider, readEnv)) {
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
