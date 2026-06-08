// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Provider id used to namespace OpenRouter language model ids (`openrouter/<model>`). */
export const OPENROUTER_PROVIDER_ID = 'openrouter';

/** Suffix OpenRouter appends to model slugs to mark them as free-tier. */
export const OPENROUTER_FREE_SUFFIX = ':free';

/**
 * Curated set of popular OpenRouter free-tier models (slugs end with `:free`). OpenRouter
 * routes these to provider endpoints (DeepInfra, Together, etc.) and serves them at no cost,
 * subject to a shared free-tier rate limit (~20 req/min, 200 req/day per account).
 *
 * The full catalog at https://openrouter.ai/models?max_price=0 changes frequently — users can
 * add or remove entries in the {@link MODELS_PREF} preference.
 */
/**
 * Slugs that must not be registered or shown as free. OpenRouter may keep a `:free` suffix in the
 * catalog even when every endpoint is paid or offline.
 */
export const OPENROUTER_EXCLUDED_MODEL_SLUGS: ReadonlySet<string> = new Set([
    'deepseek/deepseek-v4-flash:free',
]);

export const OPENROUTER_DEFAULT_FREE_MODELS: readonly string[] = [
    // The OpenRouter free catalog (https://openrouter.ai/models?max_price=0) churns frequently —
    // upstream sponsors go offline (status -2/-5) without the slug being removed from the catalog,
    // which is what produces the runtime `404 No endpoints found for X:free`. The entries below
    // were verified by querying each model's `/endpoints` and keeping only the ones whose free
    // provider reports `status: 0` (live) at the time of writing.
    //
    // When a default below starts 404'ing, replace it via the `ai-features.openrouter.openrouterModels`
    // preference. Any `:free` slug keeps the 🆓 badge automatically (the detector is structural).

    // 1M context — best fit for the Coder agent's large system prompt.
    'nvidia/nemotron-3-super-120b-a12b:free',
    // 262k context — modern, strong general model.
    'google/gemma-4-31b-it:free',
    // Moonshot Kimi K2.6 — strong agentic / reasoning on a free endpoint.
    'moonshotai/kimi-k2.6:free',
    // 256k context — NVIDIA Nemotron Nano (Nemo, but smaller / faster).
    'nvidia/nemotron-3-nano-30b-a3b:free',
    // 131k context — well-tested, strong tool calling.
    'openai/gpt-oss-120b:free',
    'z-ai/glm-4.5-air:free',
    // Massive 405B model on a free endpoint — slow but capable.
    'nousresearch/hermes-3-llama-3.1-405b:free'
];

export function normalizeOpenRouterModelSlug(raw: string): string {
    const trimmed = raw.trim();
    const prefix = `${OPENROUTER_PROVIDER_ID}/`;
    return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed;
}

export function isExcludedOpenRouterModelSlug(raw: string): boolean {
    const slug = normalizeOpenRouterModelSlug(raw);
    return !!slug && OPENROUTER_EXCLUDED_MODEL_SLUGS.has(slug);
}

/** Drops excluded slugs from preference lists and curated fallbacks. */
export function filterOpenRouterModelSlugs(slugs: readonly string[]): string[] {
    return slugs
        .map(slug => slug.trim())
        .filter(Boolean)
        .filter(slug => !isExcludedOpenRouterModelSlug(slug));
}

/**
 * Returns whether the given language model id refers to a free-tier OpenRouter model. Detection
 * is structural — any model whose slug ends with {@link OPENROUTER_FREE_SUFFIX} qualifies,
 * regardless of whether it is in the curated defaults list. This way user-added free models
 * automatically pick up the "Free" badge.
 *
 * @param languageModelId the fully qualified language model id, e.g. `openrouter/meta-llama/llama-3.3-70b-instruct:free`
 */
export function isFreeOpenRouterModelId(languageModelId: string): boolean {
    const prefix = `${OPENROUTER_PROVIDER_ID}/`;
    if (!languageModelId.startsWith(prefix)) {
        return false;
    }
    const slug = languageModelId.slice(prefix.length);
    if (isExcludedOpenRouterModelSlug(slug)) {
        return false;
    }
    return languageModelId.endsWith(OPENROUTER_FREE_SUFFIX);
}
