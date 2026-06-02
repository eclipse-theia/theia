// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { LEGACY_OPENCLAUDE_AGENT_ID, QAIQ_AGENT_ID } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-task-client';
import {
    formatQaiqProviderFlags,
    type QaapQaiqModelBinding,
} from './qaap-qaiq-model-binding';

function shellQuote(value: string): string {
    if (/^[a-zA-Z0-9_./:@+-]+$/.test(value)) {
        return value;
    }
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** LiteLLM / Aider model string from a QAAP picker binding. */
export function formatAiderModelArg(binding: QaapQaiqModelBinding): string {
    const { vendor, modelId } = binding;
    switch (vendor) {
        case 'openrouter':
            return `openrouter/${modelId}`;
        case 'nvidia':
            return `openai/${modelId}`;
        case 'google':
        case 'gemini':
            return `gemini/${modelId}`;
        case 'ollama':
            return `ollama/${modelId}`;
        case 'anthropic':
            return modelId.includes('/') ? modelId : `anthropic/${modelId}`;
        case 'mistral':
            return `mistral/${modelId}`;
        case 'openai':
            return modelId.includes('/') ? modelId : `openai/${modelId}`;
        case 'huggingface':
            return `huggingface/${modelId}`;
        default:
            return modelId.includes('/') ? modelId : `${vendor}/${modelId}`;
    }
}

/**
 * CLI flags inserted into agent templates (`{model_flags}` / `{qaiq_flags}`).
 * Returns an empty string when the agent has no known model switch.
 */
export function formatModelFlagsForAgent(agentId: string, binding: QaapQaiqModelBinding): string {
    const normalized = agentId.toLowerCase();
    if (normalized === QAIQ_AGENT_ID || normalized === LEGACY_OPENCLAUDE_AGENT_ID) {
        return formatQaiqProviderFlags(binding);
    }
    if (normalized === 'aider') {
        return `--model ${shellQuote(formatAiderModelArg(binding))}`;
    }
    if (normalized === 'codex') {
        return `-m ${shellQuote(binding.modelId)}`;
    }
    if (normalized === 'antigravity' || normalized === 'gemini') {
        // agy reads the model from ~/.gemini/antigravity-cli/settings.json (see qaap-antigravity-settings).
        return '';
    }
    return `--model ${shellQuote(binding.modelId)}`;
}
