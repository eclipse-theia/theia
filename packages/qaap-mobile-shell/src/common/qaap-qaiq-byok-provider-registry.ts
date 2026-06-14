// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { filterOpenRouterModelSlugs } from '@theia/qaap-ai-openrouter/lib/common/openrouter-models';
import type { QaapQaiqModelOption } from './qaap-agent-task-client';

export type QaapQaiqProviderId = QaapQaiqModelOption['provider'];

export type QaapPreferenceReader = (key: string) => unknown;

/** Maps a Settings BYOK vendor to QAIQ composer models and runtime credentials. Add new providers here. */
export interface QaapQaiqByokProviderDescriptor {
    /** Primary vendor prefix in Theia language model ids (`vendor/model`). */
    readonly vendor: string;
    /** Alternate alias prefixes (e.g. `gemini` → google). */
    readonly aliasVendors?: readonly string[];
    /** QAIQ CLI `--provider` value. */
    readonly provider: QaapQaiqProviderId;
    /** Preference that must be set (API key, host, etc.). */
    readonly credentialPref: string;
    /** Preference keys listing configured models. */
    readonly modelListPrefs: readonly string[];
    /** Used when credential is set but every model list is empty. */
    readonly fallbackModels?: readonly string[];
    /** Composer picker section title. */
    readonly label: string;
    /** Env vars injected when this vendor is selected at runtime. */
    readonly credentialEnv?: readonly {
        readonly env: string;
        readonly pref?: string;
        readonly defaultValue?: string;
    }[];
}

const OPENROUTER_FALLBACK_MODELS = [
    'nvidia/nemotron-3-super-120b-a12b:free',
    'moonshotai/kimi-k2.6:free',
    'google/gemma-4-31b-it:free',
] as const;

const NVIDIA_FALLBACK_MODELS = [
    'meta/llama-3.3-70b-instruct',
    'nvidia/llama-3.3-nemotron-super-49b-v1',
] as const;

const HUGGINGFACE_FALLBACK_MODELS = [
    'meta-llama/Llama-3.2-3B-Instruct',
    'meta-llama/Llama-3.1-8B-Instruct',
] as const;

/** Single registry for QAIQ Settings-backed providers. Extend when adding a new BYOK integration. */
export const QAAP_QAIQ_BYOK_PROVIDERS: readonly QaapQaiqByokProviderDescriptor[] = [
    {
        vendor: 'openrouter',
        provider: 'openai',
        credentialPref: 'ai-features.openrouter.openrouterApiKey',
        modelListPrefs: ['ai-features.openrouter.openrouterModels'],
        fallbackModels: OPENROUTER_FALLBACK_MODELS,
        label: 'OpenRouter',
        credentialEnv: [
            { env: 'OPENROUTER_API_KEY', pref: 'ai-features.openrouter.openrouterApiKey' },
            { env: 'OPENAI_API_KEY', pref: 'ai-features.openrouter.openrouterApiKey' },
            { env: 'OPENAI_BASE_URL', pref: 'ai-features.openrouter.openrouterBaseUrl', defaultValue: 'https://openrouter.ai/api/v1' },
        ],
    },
    {
        vendor: 'nvidia',
        provider: 'openai',
        credentialPref: 'ai-features.nvidia.nvidiaApiKey',
        modelListPrefs: ['ai-features.nvidia.nvidiaModels'],
        fallbackModels: NVIDIA_FALLBACK_MODELS,
        label: 'NVIDIA NIM',
        credentialEnv: [
            { env: 'NVIDIA_API_KEY', pref: 'ai-features.nvidia.nvidiaApiKey' },
            { env: 'OPENAI_API_KEY', pref: 'ai-features.nvidia.nvidiaApiKey' },
            { env: 'OPENAI_BASE_URL', pref: 'ai-features.nvidia.nvidiaBaseUrl', defaultValue: 'https://integrate.api.nvidia.com/v1' },
        ],
    },
    {
        vendor: 'openai',
        provider: 'openai',
        credentialPref: 'ai-features.openAiOfficial.openAiApiKey',
        modelListPrefs: [
            'ai-features.openAiOfficial.models',
            'ai-features.openAiOfficial.officialOpenAiModels',
        ],
        label: 'OpenAI',
        credentialEnv: [{ env: 'OPENAI_API_KEY', pref: 'ai-features.openAiOfficial.openAiApiKey' }],
    },
    {
        vendor: 'google',
        aliasVendors: ['gemini'],
        provider: 'gemini',
        credentialPref: 'ai-features.google.apiKey',
        modelListPrefs: ['ai-features.google.models'],
        fallbackModels: ['gemini-2.5-flash'],
        label: 'Google Gemini',
        credentialEnv: [
            { env: 'GOOGLE_API_KEY', pref: 'ai-features.google.apiKey' },
            { env: 'GEMINI_API_KEY', pref: 'ai-features.google.apiKey' },
        ],
    },
    {
        vendor: 'anthropic',
        provider: 'anthropic',
        credentialPref: 'ai-features.anthropic.AnthropicApiKey',
        modelListPrefs: ['ai-features.anthropic.AnthropicModels'],
        label: 'Anthropic',
        credentialEnv: [{ env: 'ANTHROPIC_API_KEY', pref: 'ai-features.anthropic.AnthropicApiKey' }],
    },
    {
        vendor: 'mistral',
        provider: 'mistral',
        credentialPref: 'ai-features.mistral.apiKey',
        modelListPrefs: ['ai-features.mistral.models'],
        label: 'Mistral',
        credentialEnv: [{ env: 'MISTRAL_API_KEY', pref: 'ai-features.mistral.apiKey' }],
    },
    {
        vendor: 'ollama',
        provider: 'ollama',
        credentialPref: 'ai-features.ollama.ollamaHost',
        modelListPrefs: ['ai-features.ollama.ollamaModels'],
        fallbackModels: ['qwen2.5-coder:7b'],
        label: 'Ollama',
        credentialEnv: [{ env: 'OLLAMA_HOST', pref: 'ai-features.ollama.ollamaHost' }],
    },
    {
        vendor: 'huggingface',
        provider: 'openai',
        credentialPref: 'ai-features.huggingFace.apiKey',
        modelListPrefs: ['ai-features.huggingFace.models'],
        fallbackModels: HUGGINGFACE_FALLBACK_MODELS,
        label: 'Hugging Face',
        credentialEnv: [
            { env: 'HUGGINGFACE_API_KEY', pref: 'ai-features.huggingFace.apiKey' },
            { env: 'HF_TOKEN', pref: 'ai-features.huggingFace.apiKey' },
            { env: 'OPENAI_API_KEY', pref: 'ai-features.huggingFace.apiKey' },
            { env: 'OPENAI_BASE_URL', defaultValue: 'https://router.huggingface.co/v1' },
        ],
    },
];

/** Schema default — must not count as a user-configured Ollama endpoint. */
export const OLLAMA_DEFAULT_HOST = 'http://localhost:11434';

const VENDOR_LOOKUP = buildVendorLookup(QAAP_QAIQ_BYOK_PROVIDERS);

function buildVendorLookup(
    providers: readonly QaapQaiqByokProviderDescriptor[],
): Map<string, QaapQaiqByokProviderDescriptor> {
    const lookup = new Map<string, QaapQaiqByokProviderDescriptor>();
    for (const provider of providers) {
        lookup.set(provider.vendor, provider);
        for (const alias of provider.aliasVendors ?? []) {
            lookup.set(alias, provider);
        }
    }
    return lookup;
}

export function findQaiqByokProvider(vendor: string | undefined): QaapQaiqByokProviderDescriptor | undefined {
    const normalized = vendor?.trim().toLowerCase();
    return normalized ? VENDOR_LOOKUP.get(normalized) : undefined;
}

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

export function providerHasByokCredential(
    readPref: QaapPreferenceReader,
    descriptor: QaapQaiqByokProviderDescriptor,
): boolean {
    if (descriptor.vendor === 'ollama') {
        for (const pref of descriptor.modelListPrefs) {
            if (readStringList(readPref, pref).length > 0) {
                return true;
            }
        }
        const host = readString(readPref, descriptor.credentialPref);
        return !!host && host !== OLLAMA_DEFAULT_HOST;
    }
    return !!readString(readPref, descriptor.credentialPref);
}

export function providerHasByokCredentialOrEnv(
    readPref: QaapPreferenceReader,
    descriptor: QaapQaiqByokProviderDescriptor,
    readEnv?: (key: string) => string | undefined,
): boolean {
    if (providerHasByokCredential(readPref, descriptor)) {
        return true;
    }
    if (!readEnv || !descriptor.credentialEnv?.length) {
        return false;
    }
    return descriptor.credentialEnv.some(mapping => !!readEnv(mapping.env)?.trim());
}

export function vendorHasByokCredential(
    readPref: QaapPreferenceReader,
    vendor: string,
    readEnv?: (key: string) => string | undefined,
): boolean {
    const descriptor = findQaiqByokProvider(vendor);
    return !!descriptor && providerHasByokCredentialOrEnv(readPref, descriptor, readEnv);
}

export function providerHasConfiguredModelList(
    readPref: QaapPreferenceReader,
    descriptor: QaapQaiqByokProviderDescriptor,
): boolean {
    for (const pref of descriptor.modelListPrefs) {
        if (readStringList(readPref, pref).length > 0) {
            return true;
        }
    }
    return false;
}

export function listExplicitByokModelIds(
    readPref: QaapPreferenceReader,
    descriptor: QaapQaiqByokProviderDescriptor,
): string[] {
    const models: string[] = [];
    for (const pref of descriptor.modelListPrefs) {
        models.push(...readStringList(readPref, pref));
    }
    let unique = [...new Set(models)];
    if (descriptor.vendor === 'openrouter') {
        unique = filterOpenRouterModelSlugs(unique);
    }
    return unique;
}

export function listByokModelIds(
    readPref: QaapPreferenceReader,
    descriptor: QaapQaiqByokProviderDescriptor,
): string[] {
    const models: string[] = [];
    for (const pref of descriptor.modelListPrefs) {
        models.push(...readStringList(readPref, pref));
    }
    let unique = [...new Set(models)];
    if (descriptor.vendor === 'openrouter') {
        unique = filterOpenRouterModelSlugs(unique);
    }
    if (unique.length) {
        return unique;
    }
    const fallback = descriptor.fallbackModels ? [...descriptor.fallbackModels] : [];
    return descriptor.vendor === 'openrouter' ? filterOpenRouterModelSlugs(fallback) : fallback;
}

export function listByokModelsFromDescriptor(
    readPref: QaapPreferenceReader,
    descriptor: QaapQaiqByokProviderDescriptor,
    readEnv?: (key: string) => string | undefined,
): QaapQaiqModelOption[] {
    const explicitIds = listExplicitByokModelIds(readPref, descriptor);
    if (explicitIds.length > 0) {
        return explicitIds.map(modelId => ({
            vendor: descriptor.vendor,
            provider: descriptor.provider,
            modelId,
            label: modelId,
        }));
    }
    if (!providerHasByokCredentialOrEnv(readPref, descriptor, readEnv)) {
        return [];
    }
    return listByokModelIds(readPref, descriptor).map(modelId => ({
        vendor: descriptor.vendor,
        provider: descriptor.provider,
        modelId,
        label: modelId,
    }));
}

export function resolveVendorForModelId(
    readPref: QaapPreferenceReader,
    modelId: string,
): string | undefined {
    const trimmed = modelId.trim();
    if (!trimmed) {
        return undefined;
    }
    const parsed = parseTheiaLanguageModelId(trimmed);
    if (parsed && parsed.vendor !== 'unknown') {
        return parsed.vendor;
    }
    const bareModelId = parsed?.modelId ?? trimmed;
    for (const provider of QAAP_QAIQ_BYOK_PROVIDERS) {
        const ids = listByokModelIds(readPref, provider);
        if (ids.some(id => id === bareModelId || id === trimmed)) {
            return provider.vendor;
        }
    }
    return undefined;
}

export function parseTheiaLanguageModelId(raw: string | undefined): QaapQaiqModelOption | undefined {
    const trimmed = raw?.trim();
    if (!trimmed) {
        return undefined;
    }
    const slash = trimmed.indexOf('/');
    if (slash <= 0) {
        return { vendor: 'unknown', provider: 'openai', modelId: trimmed, label: trimmed };
    }
    const vendorKey = trimmed.slice(0, slash).toLowerCase();
    const rest = trimmed.slice(slash + 1);
    const descriptor = findQaiqByokProvider(vendorKey);
    if (descriptor) {
        return {
            vendor: descriptor.vendor,
            provider: descriptor.provider,
            modelId: rest,
            label: rest,
        };
    }
    return { vendor: 'unknown', provider: 'openai', modelId: trimmed, label: trimmed };
}

export function formatQaiqModelProviderLabel(vendor: string): string {
    const descriptor = findQaiqByokProvider(vendor);
    if (descriptor) {
        return descriptor.label;
    }
    if (!vendor.trim()) {
        return vendor;
    }
    return vendor.charAt(0).toUpperCase() + vendor.slice(1);
}

export function applyByokCredentialEnv(
    env: NodeJS.ProcessEnv,
    vendor: string,
    readPref: QaapPreferenceReader,
): void {
    const descriptor = findQaiqByokProvider(vendor);
    if (!descriptor?.credentialEnv) {
        return;
    }
    for (const mapping of descriptor.credentialEnv) {
        const value = (mapping.pref ? readString(readPref, mapping.pref) : undefined) ?? mapping.defaultValue;
        if (value) {
            env[mapping.env] = value;
        }
    }
}
