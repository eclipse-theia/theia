// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapQaiqModelOption } from './qaap-agent-task-client';

export type QaapQaiqProviderId = QaapQaiqModelOption['provider'];

export type QaapPreferenceReader = (key: string) => unknown;

type AliasMap = Record<string, { readonly selectedModel?: string } | undefined>;

/** Fallback slugs when a provider API key is set but the models preference is still empty. */
const OPENROUTER_FALLBACK_MODELS = [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'google/gemma-4-31b-it:free',
    'qwen/qwen3-next-80b-a3b-instruct:free',
] as const;

const NVIDIA_FALLBACK_MODELS = [
    'meta/llama-3.3-70b-instruct',
    'nvidia/llama-3.3-nemotron-super-49b-v1',
] as const;

const PROVIDER_MODEL_LIST_PREFS: readonly { readonly vendor: string; readonly pref: string; readonly provider: QaapQaiqProviderId }[] = [
    { vendor: 'openrouter', pref: 'ai-features.openrouter.openrouterModels', provider: 'openai' },
    { vendor: 'nvidia', pref: 'ai-features.nvidia.nvidiaModels', provider: 'openai' },
    { vendor: 'ollama', pref: 'ai-features.ollama.ollamaModels', provider: 'ollama' },
    { vendor: 'mistral', pref: 'ai-features.mistral.models', provider: 'mistral' },
    { vendor: 'openai', pref: 'ai-features.openAiOfficial.models', provider: 'openai' },
    { vendor: 'openai', pref: 'ai-features.openAiOfficial.officialOpenAiModels', provider: 'openai' },
    { vendor: 'anthropic', pref: 'ai-features.anthropic.AnthropicModels', provider: 'anthropic' },
];

const ALIAS_KEYS = ['default/code', 'default/universal', 'default/code-completion', 'default/summarize'] as const;

function readString(readPref: QaapPreferenceReader, key: string): string | undefined {
    const value = readPref(key);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readStringList(readPref: QaapPreferenceReader, key: string): string[] {
    const value = readPref(key);
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .filter(entry => typeof entry === 'string')
        .map(entry => entry.trim())
        .filter(Boolean);
}

function vendorHasCredential(readPref: QaapPreferenceReader, vendor: string): boolean {
    switch (vendor) {
        case 'openrouter':
            return !!readString(readPref, 'ai-features.openrouter.openrouterApiKey');
        case 'nvidia':
            return !!readString(readPref, 'ai-features.nvidia.nvidiaApiKey');
        case 'openai':
            return !!readString(readPref, 'ai-features.openAiOfficial.openAiApiKey');
        case 'google':
        case 'gemini':
            return !!readString(readPref, 'ai-features.google.apiKey');
        case 'anthropic':
            return !!readString(readPref, 'ai-features.anthropic.AnthropicApiKey');
        case 'mistral':
            return !!readString(readPref, 'ai-features.mistral.apiKey');
        case 'ollama':
            return !!readString(readPref, 'ai-features.ollama.ollamaHost');
        case 'huggingface':
            return !!readString(readPref, 'ai-features.huggingFace.apiKey');
        default:
            return false;
    }
}

function parseTheiaLanguageModelId(raw: string | undefined): QaapQaiqModelOption | undefined {
    const trimmed = raw?.trim();
    if (!trimmed) {
        return undefined;
    }
    const slash = trimmed.indexOf('/');
    if (slash <= 0) {
        return { vendor: 'unknown', provider: 'openai', modelId: trimmed, label: trimmed };
    }
    const vendor = trimmed.slice(0, slash).toLowerCase();
    const rest = trimmed.slice(slash + 1);
    switch (vendor) {
        case 'openrouter':
        case 'nvidia':
        case 'huggingface':
            return { vendor, provider: 'openai', modelId: rest, label: rest };
        case 'openai':
            return { vendor, provider: 'openai', modelId: rest, label: rest };
        case 'google':
        case 'gemini':
            return { vendor: 'google', provider: 'gemini', modelId: rest, label: rest };
        case 'ollama':
            return { vendor, provider: 'ollama', modelId: rest, label: rest };
        case 'anthropic':
            return { vendor, provider: 'anthropic', modelId: rest, label: rest };
        case 'mistral':
            return { vendor, provider: 'mistral', modelId: rest, label: rest };
        default:
            return { vendor, provider: 'openai', modelId: trimmed, label: trimmed };
    }
}

/** Models available for QAIQ from Settings (API keys + model lists + aliases). */
export function listQaiqModelsFromPreferences(readPref: QaapPreferenceReader): QaapQaiqModelOption[] {
    const deduped = new Map<string, QaapQaiqModelOption>();

    const add = (option: QaapQaiqModelOption): void => {
        if (!vendorHasCredential(readPref, option.vendor)) {
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

    if (readString(readPref, 'ai-features.openrouter.openrouterApiKey')) {
        const models = readStringList(readPref, 'ai-features.openrouter.openrouterModels');
        const slugs = models.length ? models : [...OPENROUTER_FALLBACK_MODELS];
        for (const modelId of slugs) {
            add({ vendor: 'openrouter', provider: 'openai', modelId, label: modelId });
        }
    }
    if (readString(readPref, 'ai-features.nvidia.nvidiaApiKey')) {
        const models = readStringList(readPref, 'ai-features.nvidia.nvidiaModels');
        const slugs = models.length ? models : [...NVIDIA_FALLBACK_MODELS];
        for (const modelId of slugs) {
            add({ vendor: 'nvidia', provider: 'openai', modelId, label: modelId });
        }
    }
    if (readString(readPref, 'ai-features.openAiOfficial.openAiApiKey')) {
        for (const entry of PROVIDER_MODEL_LIST_PREFS) {
            if (entry.vendor !== 'openai') {
                continue;
            }
            for (const modelId of readStringList(readPref, entry.pref)) {
                add({ vendor: 'openai', provider: 'openai', modelId, label: modelId });
            }
        }
    }
    if (readString(readPref, 'ai-features.google.apiKey')) {
        const models = readStringList(readPref, 'ai-features.google.models');
        const slugs = models.length ? models : ['gemini-2.5-flash'];
        for (const modelId of slugs) {
            add({ vendor: 'google', provider: 'gemini', modelId, label: modelId });
        }
    }
    if (readString(readPref, 'ai-features.anthropic.AnthropicApiKey')) {
        for (const modelId of readStringList(readPref, 'ai-features.anthropic.AnthropicModels')) {
            add({ vendor: 'anthropic', provider: 'anthropic', modelId, label: modelId });
        }
    }
    if (readString(readPref, 'ai-features.mistral.apiKey')) {
        for (const modelId of readStringList(readPref, 'ai-features.mistral.models')) {
            add({ vendor: 'mistral', provider: 'mistral', modelId, label: modelId });
        }
    }
    if (readString(readPref, 'ai-features.ollama.ollamaHost')) {
        const models = readStringList(readPref, 'ai-features.ollama.ollamaModels');
        for (const modelId of models.length ? models : ['qwen2.5-coder:7b']) {
            add({ vendor: 'ollama', provider: 'ollama', modelId, label: modelId });
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

export function formatQaiqModelProviderLabel(vendor: string): string {
    switch (vendor.toLowerCase()) {
        case 'openrouter':
            return 'OpenRouter';
        case 'nvidia':
            return 'NVIDIA NIM';
        case 'google':
        case 'gemini':
            return 'Google Gemini';
        case 'anthropic':
            return 'Anthropic';
        case 'openai':
            return 'OpenAI';
        case 'ollama':
            return 'Ollama';
        case 'mistral':
            return 'Mistral';
        case 'huggingface':
            return 'Hugging Face';
        default:
            return vendor.charAt(0).toUpperCase() + vendor.slice(1);
    }
}
