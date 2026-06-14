// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    applyByokCredentialEnv,
    parseTheiaLanguageModelId as parseRegistryLanguageModelId,
    QAAP_QAIQ_BYOK_PROVIDERS,
    resolveVendorForModelId,
    type QaapPreferenceReader,
} from '@theia/qaap-mobile-shell/lib/common/qaap-qaiq-byok-provider-registry';

export type QaapQaiqProviderId = 'openai' | 'gemini' | 'ollama' | 'anthropic' | 'mistral';

export type QaapModelVendor =
    | 'openrouter'
    | 'nvidia'
    | 'google'
    | 'gemini'
    | 'ollama'
    | 'anthropic'
    | 'openai'
    | 'mistral'
    | 'huggingface'
    | 'unknown';

export interface QaapQaiqModelBinding {
    readonly vendor: QaapModelVendor;
    readonly provider: QaapQaiqProviderId;
    readonly modelId: string;
    readonly contextWindow: number;
}

export const DEFAULT_QAAP_MODEL_CONTEXT_WINDOW = 128_000;

export type { QaapPreferenceReader };

type AliasMap = Record<string, { readonly selectedModel?: string } | undefined>;

// Real Theia AI alias ids (see ai-core frontend-language-model-alias-registry).
// Priority: the QAIQ coding agent prefers the "code" model, then the general-purpose
// "universal" model, falling back to the remaining slots so a model the user configured
// in any alias is honoured before the hard-coded env fallbacks kick in.
const ALIAS_KEYS = ['default/code', 'default/universal', 'default/code-completion', 'default/summarize'] as const;

export function resolveQaapQaiqModelBinding(readPref: QaapPreferenceReader): QaapQaiqModelBinding | undefined {
    const aliases = readPref('ai-features.languageModelAliases') as AliasMap | undefined;
    for (const key of ALIAS_KEYS) {
        const binding = parseTheiaLanguageModelId(aliases?.[key]?.selectedModel);
        if (binding) {
            return binding;
        }
    }
    for (const provider of QAAP_QAIQ_BYOK_PROVIDERS) {
        for (const pref of provider.modelListPrefs) {
            const raw = firstStringInPrefList(readPref(pref));
            const binding = parsePrefListModel(provider.vendor as QaapModelVendor, raw);
            if (binding) {
                return binding;
            }
        }
    }
    return undefined;
}

function firstStringInPrefList(value: unknown): string | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }
    for (const entry of value) {
        if (typeof entry === 'string' && entry.trim()) {
            return entry.trim();
        }
    }
    return undefined;
}

function parsePrefListModel(vendor: QaapModelVendor, raw: string | undefined): QaapQaiqModelBinding | undefined {
    if (!raw?.trim()) {
        return undefined;
    }
    const modelId = raw.startsWith(`${vendor}/`) ? raw.slice(vendor.length + 1) : raw;
    return parseTheiaLanguageModelId(`${vendor}/${modelId}`);
}

export function parseTheiaLanguageModelId(raw: string | undefined): QaapQaiqModelBinding | undefined {
    const parsed = parseRegistryLanguageModelId(raw);
    if (!parsed) {
        return undefined;
    }
    return {
        vendor: parsed.vendor as QaapModelVendor,
        provider: parsed.provider,
        modelId: parsed.modelId,
        contextWindow: DEFAULT_QAAP_MODEL_CONTEXT_WINDOW,
    };
}

/** Build a QAIQ CLI binding from the user's explicit picker selection (provider + vendor + modelId). */
export function bindingFromQaiqModelSelection(model: {
    readonly provider: QaapQaiqProviderId;
    readonly vendor: string;
    readonly modelId: string;
}, readPref?: QaapPreferenceReader): QaapQaiqModelBinding {
    const binding: QaapQaiqModelBinding = {
        provider: model.provider,
        vendor: (model.vendor?.trim() || 'unknown') as QaapModelVendor,
        modelId: model.modelId.trim(),
        contextWindow: DEFAULT_QAAP_MODEL_CONTEXT_WINDOW,
    };
    return readPref ? normalizeQaiqModelBinding(binding, readPref) : binding;
}

/** Infer vendor from Settings model lists when the client only sent modelId. */
export function normalizeQaiqModelBinding(
    binding: QaapQaiqModelBinding,
    readPref: QaapPreferenceReader,
): QaapQaiqModelBinding {
    if (binding.vendor && binding.vendor !== 'unknown') {
        return binding;
    }
    const vendor = resolveVendorForModelId(readPref, binding.modelId);
    return vendor ? { ...binding, vendor: vendor as QaapModelVendor } : binding;
}

export function formatQaiqProviderFlags(binding: QaapQaiqModelBinding): string {
    return `--provider ${binding.provider} --model ${shellQuote(binding.modelId)}`;
}

function shellQuote(value: string): string {
    if (/^[a-zA-Z0-9_./:@+-]+$/.test(value)) {
        return value;
    }
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function applyQaapQaiqModelEnv(env: NodeJS.ProcessEnv, binding: QaapQaiqModelBinding): void {
    env.QAAP_ACTIVE_MODEL = binding.modelId;
    env.QAAP_ACTIVE_PROVIDER = binding.provider;
    env.QAAP_ACTIVE_VENDOR = binding.vendor;
    env.QAAP_MODEL_CONTEXT_WINDOW = String(binding.contextWindow);
}

/** Map QAAP provider credentials for the resolved vendor (NVIDIA NIM, OpenRouter, etc.). */
export function applyQaapQaiqCredentialEnv(env: NodeJS.ProcessEnv, binding: QaapQaiqModelBinding, readPref: QaapPreferenceReader): void {
    applyByokCredentialEnv(env, binding.vendor, readPref);
}
