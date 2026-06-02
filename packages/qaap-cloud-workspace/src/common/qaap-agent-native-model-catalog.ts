// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { NATIVE_MODEL_CATALOG_EXCLUDED_AGENT_IDS } from '@theia/qaap-mobile-shell/lib/common/qaap-builtin-agents';
import type { QaapQaiqModelOption } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-task-client';

/** Keep in sync with {@link SETTINGS_MODEL_CATALOG_AGENT_IDS} in qaap-agent-model-selection. */
export const SETTINGS_MODEL_CATALOG_AGENT_IDS = new Set(['qaiq']);

export function agentUsesSettingsModelCatalog(agentId: string | undefined): boolean {
    const normalized = agentId?.trim().toLowerCase();
    return !!normalized && SETTINGS_MODEL_CATALOG_AGENT_IDS.has(normalized);
}

export function agentUsesNativeModelCatalog(agentId: string | undefined): boolean {
    const normalized = agentId?.trim().toLowerCase();
    if (!normalized || normalized === 'shell' || agentUsesSettingsModelCatalog(normalized)) {
        return false;
    }
    if (NATIVE_MODEL_CATALOG_EXCLUDED_AGENT_IDS.has(normalized)) {
        return false;
    }
    return true;
}

function nativeOption(
    agentId: string,
    modelId: string,
    label?: string,
    provider: QaapQaiqModelOption['provider'] = 'openai',
): QaapQaiqModelOption {
    return {
        provider,
        vendor: agentId,
        modelId,
        label: label ?? modelId,
    };
}

/** Curated fallback when a CLI is missing on the VPS or its list command fails. */
export function listStaticNativeAgentModels(agentId: string): QaapQaiqModelOption[] {
    const id = agentId.trim().toLowerCase();
    switch (id) {
        case 'qwen':
            return [
                nativeOption(id, 'qwen3-coder-plus', 'Qwen3 Coder Plus'),
                nativeOption(id, 'qwen3-coder-flash', 'Qwen3 Coder Flash'),
                nativeOption(id, 'qwen3.5-plus', 'Qwen3.5 Plus'),
            ];
        case 'codex':
            return [
                nativeOption(id, 'o4-mini', 'o4-mini'),
                nativeOption(id, 'gpt-4o', 'gpt-4o'),
                nativeOption(id, 'gpt-4.1', 'gpt-4.1'),
                nativeOption(id, 'gpt-4.1-mini', 'gpt-4.1-mini'),
            ];
        case 'claude':
            return [
                nativeOption(id, 'sonnet', 'Sonnet', 'anthropic'),
                nativeOption(id, 'opus', 'Opus', 'anthropic'),
                nativeOption(id, 'haiku', 'Haiku', 'anthropic'),
                nativeOption(id, 'claude-sonnet-4-6', 'claude-sonnet-4-6', 'anthropic'),
                nativeOption(id, 'claude-opus-4-6', 'claude-opus-4-6', 'anthropic'),
            ];
        case 'copilot':
            return [
                nativeOption(id, 'gpt-5.2', 'GPT-5.2'),
                nativeOption(id, 'gpt-5.1', 'GPT-5.1'),
                nativeOption(id, 'claude-sonnet-4.5', 'Claude Sonnet 4.5', 'anthropic'),
                nativeOption(id, 'claude-haiku-4.5', 'Claude Haiku 4.5', 'anthropic'),
            ];
        case 'antigravity':
        case 'gemini':
            return [
                nativeOption(id, 'gemini-2.5-flash', 'Gemini 2.5 Flash', 'gemini'),
                nativeOption(id, 'gemini-2.5-pro', 'Gemini 2.5 Pro', 'gemini'),
                nativeOption(id, 'gemini-3.1-pro-preview', 'Gemini 3.1 Pro', 'gemini'),
            ];
        case 'opencode':
            return [
                nativeOption(id, 'opencode/claude-sonnet-4-6', 'Claude Sonnet 4.6'),
                nativeOption(id, 'opencode/gpt-5.2-codex', 'GPT-5.2 Codex'),
                nativeOption(id, 'opencode/gemini-3.1-pro', 'Gemini 3.1 Pro', 'gemini'),
            ];
        case 'aider':
            return [
                nativeOption(id, 'sonnet', 'Sonnet', 'anthropic'),
                nativeOption(id, 'gpt-4o', 'GPT-4o'),
            ];
        default:
            return [];
    }
}

export function parseNativeModelLines(agentId: string, lines: readonly string[]): QaapQaiqModelOption[] {
    const deduped = new Map<string, QaapQaiqModelOption>();
    for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) {
            continue;
        }
        const modelId = line;
        const key = modelId.toLowerCase();
        if (!deduped.has(key)) {
            deduped.set(key, nativeOption(agentId, modelId));
        }
    }
    return [...deduped.values()];
}
