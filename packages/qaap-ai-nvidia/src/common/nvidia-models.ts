// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Provider id used to namespace NVIDIA language model ids (`nvidia/<model>`). */
export const NVIDIA_PROVIDER_ID = 'nvidia';

/**
 * NVIDIA NIM models that are available on the free tier — usable with the free credits
 * granted by a build.nvidia.com account. These get a "free" badge in the UI so users can
 * tell at a glance which models cost nothing to try.
 */
export const NVIDIA_FREE_MODELS: readonly string[] = [
    'nvidia/llama-3.3-nemotron-super-49b-v1',
    'meta/llama-3.3-70b-instruct',
    // Replaces qwen/qwen2.5-coder-32b-instruct (NIM EOL 2026-05-12).
    'qwen/qwen3-coder-480b-a35b-instruct',
    'minimaxai/minimax-m2.7'
];

/**
 * Returns whether the given language model id refers to a free-tier NVIDIA model.
 *
 * @param languageModelId the fully qualified language model id, e.g. `nvidia/meta/llama-3.3-70b-instruct`
 */
export function isFreeNvidiaModelId(languageModelId: string): boolean {
    const prefix = `${NVIDIA_PROVIDER_ID}/`;
    if (!languageModelId.startsWith(prefix)) {
        return false;
    }
    const modelId = languageModelId.slice(prefix.length);
    return NVIDIA_FREE_MODELS.includes(modelId);
}
