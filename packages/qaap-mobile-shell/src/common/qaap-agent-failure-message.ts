// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';

export type QaapAgentFailureKind = 'quota' | 'rate_limit' | 'model_unavailable';

const AGENT_FAILURE_SCAN_LIMIT = 12_000;

const QUOTA_PATTERNS: readonly RegExp[] = [
    /\binvalid[_\s-]?request\b/i,
    /\binsufficient[_\s-]?quota\b/i,
    /\bquota\b/i,
    /\bfree[_\s-]?credits?\b/i,
    /\bcredits?\s+(?:exhausted|depleted|used\s+up|ran\s+out)\b/i,
    /\bout\s+of\s+credits?\b/i,
    /\bbilling\b/i,
    /\bresource[_\s-]?exhausted\b/i,
];

const RATE_LIMIT_PATTERNS: readonly RegExp[] = [
    /\brate[_\s-]?limit(?:ed|ing)?\b/i,
    /\btoo\s+many\s+requests\b/i,
    /\b429\b/,
];

const MODEL_UNAVAILABLE_PATTERNS: readonly RegExp[] = [
    /\bissue\s+with\s+the\s+selected\s+model\b/i,
    /\bmodel\s+(?:is\s+)?unavailable\b/i,
    /\bmodel[_\s-]?not[_\s-]?found\b/i,
    /\bmodel\s+does\s+not\s+exist\b/i,
    /\bno\s+such\s+model\b/i,
    /\bunknown\s+model\b/i,
    /\bmodel\s+not\s+supported\b/i,
];

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
}

/** Classify agent CLI/API stderr or transcript text for user-facing failure copy. */
export function detectAgentFailureKind(log: string | undefined): QaapAgentFailureKind | undefined {
    const sample = (log ?? '').trim().slice(0, AGENT_FAILURE_SCAN_LIMIT);
    if (!sample) {
        return undefined;
    }
    if (matchesAny(sample, QUOTA_PATTERNS)) {
        return 'quota';
    }
    if (matchesAny(sample, RATE_LIMIT_PATTERNS)) {
        return 'rate_limit';
    }
    if (matchesAny(sample, MODEL_UNAVAILABLE_PATTERNS)) {
        return 'model_unavailable';
    }
    return undefined;
}

export function localizeAgentFailureMessage(kind: QaapAgentFailureKind): string {
    switch (kind) {
        case 'quota':
            return nls.localize(
                'qaap/agentFailure/freeCreditsExhausted',
                'Free credits for this model may be exhausted. Try OpenCode or another model in the composer.',
            );
        case 'rate_limit':
            return nls.localize(
                'qaap/agentFailure/rateLimited',
                'Rate limit reached for this model. Wait a moment or switch to OpenCode or another model.',
            );
        case 'model_unavailable':
            return nls.localize(
                'qaap/agentFailure/modelUnavailable',
                'This model is unavailable. Try OpenCode or another model in the composer.',
            );
    }
}

/**
 * User-facing turn failure — prefers a product message derived from agent logs over generic exit text.
 */
export function resolveAgentTurnFailureMessage(
    log: string | undefined,
    genericReason: string,
): string {
    const kind = detectAgentFailureKind(log);
    if (kind) {
        return localizeAgentFailureMessage(kind);
    }
    return genericReason;
}
