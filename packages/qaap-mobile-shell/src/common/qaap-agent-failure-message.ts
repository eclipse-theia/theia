// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { nls } from '@theia/core/lib/common/nls';

export type QaapAgentFailureKind =
    | 'quota'
    | 'rate_limit'
    | 'model_unavailable'
    | 'auth'
    | 'timeout'
    | 'network';

export type QaapAgentTurnFailureState = 'failed' | 'interrupted' | 'cancelled';

const AGENT_FAILURE_SCAN_LIMIT = 12_000;
const AGENT_LOG_HINT_MAX_LENGTH = 220;
const ANSI_REGEX = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

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

const AUTH_PATTERNS: readonly RegExp[] = [
    /\binvalid[_\s-]?api[_\s-]?key\b/i,
    /\bauthentication\b/i,
    /\bunauthorized\b/i,
    /\b401\b/,
    /\b403\b/,
    /\bforbidden\b/i,
    /\baccess\s+denied\b/i,
];

const TIMEOUT_PATTERNS: readonly RegExp[] = [
    /\btimeout\b/i,
    /\btimed\s+out\b/i,
    /\bETIMEDOUT\b/,
    /\bdeadline\s+exceeded\b/i,
];

const NETWORK_PATTERNS: readonly RegExp[] = [
    /\bECONNREFUSED\b/,
    /\bENOTFOUND\b/,
    /\bEAI_AGAIN\b/,
    /\bnetwork\s+error\b/i,
    /\bfetch\s+failed\b/i,
    /\bconnection\s+(?:refused|reset)\b/i,
];

const LEGACY_AGENT_FAILURE_REGEX = /^Agent\s+(failed|interrupted|cancelled)(?:\s+\(exit\s+(\d+)\))?\.?$/i;

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(text));
}

function truncateAgentFailureHint(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length <= AGENT_LOG_HINT_MAX_LENGTH) {
        return trimmed;
    }
    return `${trimmed.slice(0, AGENT_LOG_HINT_MAX_LENGTH - 1)}…`;
}

function extractJsonFailureHint(sample: string): string | undefined {
    for (const line of sample.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
            continue;
        }
        try {
            const parsed = JSON.parse(trimmed) as unknown;
            const hint = readJsonFailureHint(parsed);
            if (hint) {
                return hint;
            }
        } catch {
            /* not JSON */
        }
    }
    return undefined;
}

function readJsonFailureHint(value: unknown): string | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    const directMessage = record.message;
    if (typeof directMessage === 'string' && directMessage.trim()) {
        return truncateAgentFailureHint(directMessage);
    }
    const error = record.error;
    if (typeof error === 'string' && error.trim()) {
        return truncateAgentFailureHint(error);
    }
    if (error && typeof error === 'object') {
        const nested = readJsonFailureHint(error);
        if (nested) {
            return nested;
        }
    }
    return undefined;
}

/** Pull a short, readable hint from agent stderr/stdout when no known kind matches. */
export function extractAgentLogFailureHint(log: string | undefined): string | undefined {
    const sample = (log ?? '').trim().slice(0, AGENT_FAILURE_SCAN_LIMIT);
    if (!sample) {
        return undefined;
    }
    const jsonHint = extractJsonFailureHint(sample);
    if (jsonHint) {
        return jsonHint;
    }
    const clean = sample.replace(ANSI_REGEX, '');
    const lines = clean.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (/^(Error|error|npm error|failed to|Cannot find|fatal:)/i.test(line)) {
            return truncateAgentFailureHint(line);
        }
    }
    return undefined;
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
    if (matchesAny(sample, AUTH_PATTERNS)) {
        return 'auth';
    }
    if (matchesAny(sample, TIMEOUT_PATTERNS)) {
        return 'timeout';
    }
    if (matchesAny(sample, NETWORK_PATTERNS)) {
        return 'network';
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
        case 'auth':
            return nls.localize(
                'qaap/agentFailure/auth',
                'Authentication failed for this model or provider. Check your API key in Settings and try again.',
            );
        case 'timeout':
            return nls.localize(
                'qaap/agentFailure/timeout',
                'The agent timed out before finishing. Try a shorter prompt or switch model.',
            );
        case 'network':
            return nls.localize(
                'qaap/agentFailure/network',
                'The agent could not reach the model provider. Check your connection and try again.',
            );
    }
}

export function localizeGenericAgentFailureMessage(
    state: QaapAgentTurnFailureState,
    exitCode?: number,
): string {
    switch (state) {
        case 'interrupted':
            return nls.localize(
                'qaap/agentFailure/interrupted',
                'The agent stopped before it could finish — often after a server restart. Send a follow-up to continue.',
            );
        case 'cancelled':
            return nls.localize(
                'qaap/agentFailure/cancelled',
                'This turn was cancelled.',
            );
        case 'failed':
        default:
            if (exitCode === undefined) {
                return nls.localize(
                    'qaap/agentFailure/failedToStart',
                    'The agent could not start this turn. Check your agent setup and try again.',
                );
            }
            return nls.localize(
                'qaap/agentFailure/failed',
                'We could not finish this task. Edit your prompt, switch model or agent, or send a follow-up.',
            );
    }
}

/** Normalize legacy technical copy persisted on older conversations. */
export function formatStoredAgentFailureMessage(error: string | undefined): string {
    const trimmed = (error ?? '').trim();
    if (!trimmed) {
        return '';
    }
    const legacy = LEGACY_AGENT_FAILURE_REGEX.exec(trimmed);
    if (legacy) {
        const state = legacy[1].toLowerCase() as QaapAgentTurnFailureState;
        const exitCode = legacy[2] ? Number(legacy[2]) : undefined;
        return localizeGenericAgentFailureMessage(state, exitCode);
    }
    return trimmed;
}

export interface QaapAgentTurnFailureOptions {
    readonly log?: string;
    readonly state?: QaapAgentTurnFailureState;
    readonly exitCode?: number;
}

/**
 * User-facing turn failure — prefers product copy derived from agent logs over exit codes.
 */
export function resolveAgentTurnFailureMessage(
    log: string | undefined,
    options?: QaapAgentTurnFailureOptions | string,
): string {
    const resolvedOptions: QaapAgentTurnFailureOptions = typeof options === 'string'
        ? { state: 'failed' }
        : (options ?? { state: 'failed' });
    const kind = detectAgentFailureKind(log);
    if (kind) {
        return localizeAgentFailureMessage(kind);
    }
    const logHint = extractAgentLogFailureHint(log);
    if (logHint) {
        return nls.localize(
            'qaap/agentFailure/logHint',
            'The agent hit an error: {0}',
            logHint,
        );
    }
    if (resolvedOptions.state) {
        return localizeGenericAgentFailureMessage(resolvedOptions.state, resolvedOptions.exitCode);
    }
    if (typeof options === 'string') {
        return formatStoredAgentFailureMessage(options) || options;
    }
    return localizeGenericAgentFailureMessage('failed', resolvedOptions.exitCode);
}
