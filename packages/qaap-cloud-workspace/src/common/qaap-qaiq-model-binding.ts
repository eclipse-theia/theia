// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

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

export type QaapPreferenceReader = (key: string) => unknown;

type AliasMap = Record<string, { readonly selectedModel?: string } | undefined>;

// Real Theia AI alias ids (see ai-core frontend-language-model-alias-registry).
// Priority: the QAIQ coding agent prefers the "code" model, then the general-purpose
// "universal" model, falling back to the remaining slots so a model the user configured
// in any alias is honoured before the hard-coded env fallbacks kick in.
const ALIAS_KEYS = ['default/code', 'default/universal', 'default/code-completion', 'default/summarize'] as const;

const PROVIDER_MODEL_LIST_PREFS: readonly { readonly vendor: QaapModelVendor; readonly pref: string }[] = [
    { vendor: 'openrouter', pref: 'ai-features.openrouter.openrouterModels' },
    { vendor: 'nvidia', pref: 'ai-features.nvidia.nvidiaModels' },
    { vendor: 'ollama', pref: 'ai-features.ollama.ollamaModels' },
    { vendor: 'huggingface', pref: 'ai-features.huggingFace.models' },
    { vendor: 'mistral', pref: 'ai-features.mistral.models' },
    { vendor: 'openai', pref: 'ai-features.openAiOfficial.models' },
];

export function resolveQaapQaiqModelBinding(readPref: QaapPreferenceReader): QaapQaiqModelBinding | undefined {
    const aliases = readPref('ai-features.languageModelAliases') as AliasMap | undefined;
    for (const key of ALIAS_KEYS) {
        const binding = parseTheiaLanguageModelId(aliases?.[key]?.selectedModel);
        if (binding) {
            return binding;
        }
    }
    for (const entry of PROVIDER_MODEL_LIST_PREFS) {
        const raw = firstStringInPrefList(readPref(entry.pref));
        const binding = parsePrefListModel(entry.vendor, raw);
        if (binding) {
            return binding;
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
    const trimmed = raw?.trim();
    if (!trimmed) {
        return undefined;
    }
    const slash = trimmed.indexOf('/');
    if (slash <= 0) {
        return openAiCompatibleBinding('unknown', trimmed);
    }
    const vendor = trimmed.slice(0, slash).toLowerCase() as QaapModelVendor;
    const rest = trimmed.slice(slash + 1);
    switch (vendor) {
        case 'openrouter':
        case 'nvidia':
        case 'huggingface':
            return openAiCompatibleBinding(vendor, rest);
        case 'openai':
            return { vendor, provider: 'openai', modelId: rest, contextWindow: DEFAULT_QAAP_MODEL_CONTEXT_WINDOW };
        case 'google':
        case 'gemini':
            return { vendor: 'google', provider: 'gemini', modelId: rest, contextWindow: DEFAULT_QAAP_MODEL_CONTEXT_WINDOW };
        case 'ollama':
            return { vendor, provider: 'ollama', modelId: rest, contextWindow: DEFAULT_QAAP_MODEL_CONTEXT_WINDOW };
        case 'anthropic':
            return { vendor, provider: 'anthropic', modelId: rest, contextWindow: DEFAULT_QAAP_MODEL_CONTEXT_WINDOW };
        case 'mistral':
            return { vendor, provider: 'mistral', modelId: rest, contextWindow: DEFAULT_QAAP_MODEL_CONTEXT_WINDOW };
        default:
            return openAiCompatibleBinding('unknown', trimmed);
    }
}

function openAiCompatibleBinding(vendor: QaapModelVendor, modelId: string): QaapQaiqModelBinding {
    return {
        vendor,
        provider: 'openai',
        modelId,
        contextWindow: DEFAULT_QAAP_MODEL_CONTEXT_WINDOW,
    };
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
    const read = (pref: string): string | undefined => {
        const value = readPref(pref);
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    switch (binding.vendor) {
        case 'nvidia': {
            const key = read('ai-features.nvidia.nvidiaApiKey');
            const base = read('ai-features.nvidia.nvidiaBaseUrl') || 'https://integrate.api.nvidia.com/v1';
            if (key) {
                env.NVIDIA_API_KEY = key;
                env.OPENAI_API_KEY = key;
                env.OPENAI_BASE_URL = base;
            }
            break;
        }
        case 'openrouter': {
            const key = read('ai-features.openrouter.openrouterApiKey');
            const base = read('ai-features.openrouter.openrouterBaseUrl') || 'https://openrouter.ai/api/v1';
            if (key) {
                env.OPENROUTER_API_KEY = key;
                env.OPENAI_API_KEY = key;
                env.OPENAI_BASE_URL = base;
            }
            break;
        }
        case 'google':
        case 'gemini': {
            const key = read('ai-features.google.apiKey');
            if (key) {
                env.GOOGLE_API_KEY = key;
                env.GEMINI_API_KEY = key;
            }
            break;
        }
        case 'ollama': {
            const host = read('ai-features.ollama.ollamaHost');
            if (host) {
                env.OLLAMA_HOST = host;
            }
            break;
        }
        case 'anthropic': {
            const key = read('ai-features.anthropic.AnthropicApiKey');
            if (key) {
                env.ANTHROPIC_API_KEY = key;
            }
            break;
        }
        case 'mistral': {
            const key = read('ai-features.mistral.apiKey');
            if (key) {
                env.MISTRAL_API_KEY = key;
            }
            break;
        }
        case 'huggingface': {
            const key = read('ai-features.huggingFace.apiKey');
            if (key) {
                env.HUGGINGFACE_API_KEY = key;
            }
            break;
        }
        case 'openai': {
            const key = read('ai-features.openAiOfficial.openAiApiKey');
            if (key) {
                env.OPENAI_API_KEY = key;
            }
            break;
        }
        default:
            break;
    }
}
