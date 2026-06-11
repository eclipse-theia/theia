// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapCreateAgentTaskQaiqModel } from './qaap-agent-task';
import {
    agentUsesNativeModelCatalog,
    agentUsesSettingsModelCatalog,
    listStaticNativeAgentModels,
} from './qaap-agent-native-model-catalog';
import {
    findQaiqByokProvider,
    type QaapQaiqByokProviderDescriptor,
} from '@theia/qaap-mobile-shell/lib/common/qaap-qaiq-byok-provider-registry';

/** Max alternate models to try after the first pick fails (inclusive of the original). */
export const MAX_AGENT_MODEL_FALLBACK_ATTEMPTS = 4;

export function agentModelKey(model: QaapCreateAgentTaskQaiqModel | undefined): string | undefined {
    const modelId = model?.modelId?.trim();
    if (!modelId) {
        return undefined;
    }
    const vendor = model?.vendor?.trim().toLowerCase() || 'unknown';
    return `${vendor}/${modelId}`;
}

function optionToAgentModel(option: {
    readonly provider: QaapCreateAgentTaskQaiqModel['provider'];
    readonly vendor: string;
    readonly modelId: string;
}): QaapCreateAgentTaskQaiqModel {
    return {
        provider: option.provider,
        vendor: option.vendor,
        modelId: option.modelId,
    };
}

function modelsFromByokDescriptor(descriptor: QaapQaiqByokProviderDescriptor): QaapCreateAgentTaskQaiqModel[] {
    const fallback = descriptor.fallbackModels ?? [];
    return fallback.map(modelId => optionToAgentModel({
        provider: descriptor.provider,
        vendor: descriptor.vendor,
        modelId,
    }));
}

/** Ordered model candidates for one agent — current pick first, then curated fallbacks. */
export function buildAgentModelFallbackChain(
    agentId: string,
    current: QaapCreateAgentTaskQaiqModel | undefined,
): readonly QaapCreateAgentTaskQaiqModel[] {
    const normalized = agentId.trim().toLowerCase();
    let candidates: QaapCreateAgentTaskQaiqModel[] = [];
    if (agentUsesSettingsModelCatalog(normalized)) {
        const vendor = current?.vendor?.trim().toLowerCase() ?? 'openrouter';
        const descriptor = findQaiqByokProvider(vendor);
        if (descriptor) {
            candidates = modelsFromByokDescriptor(descriptor);
        }
    } else if (agentUsesNativeModelCatalog(normalized)) {
        candidates = listStaticNativeAgentModels(normalized).map(optionToAgentModel);
    }
    const chain: QaapCreateAgentTaskQaiqModel[] = [];
    const seen = new Set<string>();
    const push = (model: QaapCreateAgentTaskQaiqModel | undefined): void => {
        const key = agentModelKey(model);
        if (!model || !key || seen.has(key)) {
            return;
        }
        seen.add(key);
        chain.push(model);
    };
    push(current);
    for (const model of candidates) {
        push(model);
    }
    return chain.slice(0, MAX_AGENT_MODEL_FALLBACK_ATTEMPTS);
}

/** Next untried model in the chain, or undefined when the chain is exhausted. */
export function resolveNextFallbackAgentModel(
    agentId: string,
    current: QaapCreateAgentTaskQaiqModel | undefined,
    triedModelKeys: ReadonlySet<string>,
): QaapCreateAgentTaskQaiqModel | undefined {
    const chain = buildAgentModelFallbackChain(agentId, current);
    for (const model of chain) {
        const key = agentModelKey(model);
        if (key && !triedModelKeys.has(key)) {
            return model;
        }
    }
    return undefined;
}

/** True when a failed turn produced no user-visible agent answer worth keeping. */
export function agentTurnHasRetryableEmptyOutput(
    agentMessage: { readonly content?: string; readonly segments?: readonly { readonly type: string; readonly content?: string; readonly finished?: boolean }[] } | undefined,
): boolean {
    if (!agentMessage) {
        return true;
    }
    if (agentMessage.segments?.length) {
        const hasText = agentMessage.segments.some(
            segment => segment.type === 'text' && !!segment.content?.trim(),
        );
        const hasFinishedTool = agentMessage.segments.some(
            segment => segment.type === 'tool' && segment.finished,
        );
        return !hasText && !hasFinishedTool;
    }
    return !agentMessage.content?.trim();
}
