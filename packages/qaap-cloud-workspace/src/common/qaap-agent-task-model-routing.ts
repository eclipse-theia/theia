// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { agentSupportsModelPicker } from '@theia/qaap-mobile-shell/lib/common/qaap-agent-model-selection';
import type { QaapCreateAgentTaskQaiqModel } from './qaap-agent-task';
import { resolveRequestAgentModel } from './qaap-agent-task';
import {
    parseTheiaLanguageModelId,
    resolveQaapQaiqModelBinding,
    type QaapPreferenceReader,
    type QaapQaiqModelBinding,
} from './qaap-qaiq-model-binding';

export type QaapAgentTaskKind = 'exploration' | 'implementation' | 'general';

type AliasMap = Record<string, { readonly selectedModel?: string } | undefined>;

const IMPLEMENTATION_PATTERN = new RegExp(
    [
        String.raw`\b(commit|refactor|implement|fix|patch|migrate|deploy|push|merge|write tests?|add feature|open pr|pull request)\b`,
        String.raw`\b(implementa|refactoriza|corrige|arregla|despliega|commit|rama|pr\b|escribe tests?)\b`,
    ].join('|'),
    'i',
);

const EXPLORATION_PATTERN = new RegExp(
    [
        String.raw`\b(explore|find|where|how does|explain|summarize|list files?|grep|search|read only|understand|what is|show me|locate|map out)\b`,
        String.raw`\b(explora|busca|encuentra|dónde|explica|resume|lista|localiza|qué es|muéstrame|mapea)\b`,
    ].join('|'),
    'i',
);

/** Classify the user turn for model routing when no explicit picker model was sent. */
export function classifyAgentTaskKind(prompt: string, interactionModeId?: string): QaapAgentTaskKind {
    const text = prompt.trim();
    if (!text) {
        return 'general';
    }
    const mode = interactionModeId?.trim().toLowerCase();
    if (mode === 'ask') {
        return 'exploration';
    }
    if (IMPLEMENTATION_PATTERN.test(text)) {
        return 'implementation';
    }
    if (EXPLORATION_PATTERN.test(text)) {
        return 'exploration';
    }
    return 'general';
}

function resolveAliasBinding(readPref: QaapPreferenceReader, aliasKey: string): QaapQaiqModelBinding | undefined {
    const aliases = readPref('ai-features.languageModelAliases') as AliasMap | undefined;
    return parseTheiaLanguageModelId(aliases?.[aliasKey]?.selectedModel);
}

/** Pick a model binding from Settings aliases based on task kind. */
export function resolveRoutedQaiqModelBinding(
    readPref: QaapPreferenceReader,
    kind: QaapAgentTaskKind,
): QaapQaiqModelBinding | undefined {
    switch (kind) {
        case 'exploration':
            return resolveAliasBinding(readPref, 'default/universal')
                ?? resolveAliasBinding(readPref, 'default/summarize')
                ?? resolveQaapQaiqModelBinding(readPref);
        case 'implementation':
            return resolveAliasBinding(readPref, 'default/code')
                ?? resolveQaapQaiqModelBinding(readPref);
        default:
            return resolveQaapQaiqModelBinding(readPref);
    }
}

export function bindingToAgentModel(binding: QaapQaiqModelBinding): QaapCreateAgentTaskQaiqModel {
    return {
        provider: binding.provider,
        vendor: binding.vendor,
        modelId: binding.modelId,
    };
}

export interface ResolveEffectiveAgentModelRequest {
    readonly agentModel?: QaapCreateAgentTaskQaiqModel;
    readonly qaiqModel?: QaapCreateAgentTaskQaiqModel;
    readonly prompt?: string;
    readonly command?: string;
    readonly interactionModeId?: string;
}

/**
 * Explicit composer/thread model wins. Otherwise route by task kind for agents that expose a model picker.
 */
export function resolveEffectiveRequestAgentModel(
    request: ResolveEffectiveAgentModelRequest,
    readPref: QaapPreferenceReader,
    agentId: string,
): QaapCreateAgentTaskQaiqModel | undefined {
    const explicit = resolveRequestAgentModel(request);
    if (explicit) {
        return explicit;
    }
    if (!agentSupportsModelPicker(agentId)) {
        return undefined;
    }
    const prompt = (request.prompt ?? request.command ?? '').trim();
    if (!prompt) {
        return undefined;
    }
    const kind = classifyAgentTaskKind(prompt, request.interactionModeId);
    const binding = resolveRoutedQaiqModelBinding(readPref, kind);
    return binding ? bindingToAgentModel(binding) : undefined;
}
