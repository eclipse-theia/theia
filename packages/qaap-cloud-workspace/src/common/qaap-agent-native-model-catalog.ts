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

/**
 * Models exposed by the Antigravity CLI `/model` menu (Google API labels).
 * Keep in sync with the TUI strings — agy stores and resolves them verbatim in settings.
 */
export const ANTIGRAVITY_API_MODELS: readonly {
    readonly label: string;
    readonly provider: QaapQaiqModelOption['provider'];
}[] = [
    { label: 'Gemini 3.5 Flash (Medium)', provider: 'gemini' },
    { label: 'Gemini 3.5 Flash (High)', provider: 'gemini' },
    { label: 'Gemini 3.5 Flash (Low)', provider: 'gemini' },
    { label: 'Gemini 3.1 Pro (Low)', provider: 'gemini' },
    { label: 'Gemini 3.1 Pro (High)', provider: 'gemini' },
    { label: 'Claude Sonnet 4.6 (Thinking)', provider: 'anthropic' },
    { label: 'Claude Opus 4.6 (Thinking)', provider: 'anthropic' },
    { label: 'GPT-OSS 120B (Medium)', provider: 'openai' },
];

export function listStaticAntigravityModels(agentId: string): QaapQaiqModelOption[] {
    const id = agentId.trim().toLowerCase();
    return ANTIGRAVITY_API_MODELS.map(entry => nativeOption(id, entry.label, entry.label, entry.provider));
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
            // Keep in sync with the Codex CLI /model menu (ChatGPT sign-in).
            return [
                nativeOption(id, 'gpt-5.5', 'GPT-5.5'),
                nativeOption(id, 'gpt-5.4', 'GPT-5.4'),
                nativeOption(id, 'gpt-5.4-mini', 'GPT-5.4-Mini'),
            ];
        case 'claude':
            // Keep in sync with the Claude Code CLI /model menu.
            return [
                nativeOption(id, 'claude-opus-4-8', 'Opus 4.8', 'anthropic'),
                nativeOption(id, 'claude-sonnet-4-6', 'Sonnet 4.6', 'anthropic'),
                nativeOption(id, 'claude-haiku-4-5', 'Haiku 4.5', 'anthropic'),
                nativeOption(id, 'claude-opus-4-7', 'Opus 4.7 Legado', 'anthropic'),
                nativeOption(id, 'claude-opus-4-6', 'Opus 4.6 Legado', 'anthropic'),
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
            return listStaticAntigravityModels(id);
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
