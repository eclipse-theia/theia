// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { parseCodexLog, QaapCodexStreamAccumulator } from './qaap-codex-stream';
import { parseOpencodeFormattedLog, parseOpencodeLog, QaapOpencodeStreamAccumulator } from './qaap-opencode-stream';
import {
    isAntigravityAgent,
    isClaudeCodeAgent,
    isCodexAgent,
    isOpencodeAgent,
    isQaiqAgent,
} from './qaap-agent-task-client';
import type { QaapAgentMessageSegment } from './qaap-qaiq-stream';
import { QaapQaiqStreamAccumulator } from './qaap-qaiq-stream';

export {
    isAntigravityAgent,
    isClaudeCodeAgent,
    isCodexAgent,
    usesStructuredAgentTranscript,
} from './qaap-agent-task-client';

export interface QaapAgentStreamAccumulator {
    push(chunk: string): readonly QaapAgentMessageSegment[];
    getSegments(): readonly QaapAgentMessageSegment[];
    getDisplayText(): string;
}

export function createAgentStreamAccumulator(agentId: string | undefined): QaapAgentStreamAccumulator | undefined {
    if (isQaiqAgent(agentId) || isClaudeCodeAgent(agentId) || isAntigravityAgent(agentId)) {
        return new QaapQaiqStreamAccumulator();
    }
    if (isOpencodeAgent(agentId)) {
        return new QaapOpencodeStreamAccumulator();
    }
    if (isCodexAgent(agentId)) {
        return new QaapCodexStreamAccumulator();
    }
    return undefined;
}

/** Parse a full agent log for transcript replay (SSE settle, history rows). */
export function parseAgentLogForTranscript(
    agentId: string | undefined,
    log: string,
): { content: string; segments: QaapAgentMessageSegment[] } {
    if (!log.trim()) {
        return { content: '', segments: [] };
    }
    if (isQaiqAgent(agentId) || isClaudeCodeAgent(agentId)) {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push(log);
        const segments = [...acc.getSegments()];
        const displayText = acc.getDisplayText().trim();
        if (segments.length > 0) {
            return { content: displayText || log.trim(), segments };
        }
        return { content: displayText, segments: [] };
    }
    if (isCodexAgent(agentId)) {
        const parsed = parseCodexLog(log);
        if (parsed.segments.length > 0) {
            return parsed;
        }
    }
    if (isOpencodeAgent(agentId)) {
        return parseOpencodeLog(log);
    }
    if (isAntigravityAgent(agentId)) {
        const acc = new QaapQaiqStreamAccumulator();
        acc.push(log);
        const segments = [...acc.getSegments()];
        if (segments.length > 0) {
            return { content: acc.getDisplayText() || log.trim(), segments };
        }
        return parseOpencodeFormattedLog(log);
    }
    return { content: log.trim(), segments: [] };
}

/** Plain reply text for storage/UI — never surfaces QAIQ NDJSON metadata envelopes. */
export function resolveAgentLogDisplayText(agentId: string | undefined, log: string): string {
    const trimmed = log.trim();
    if (!trimmed) {
        return '';
    }
    return parseAgentLogForTranscript(agentId, trimmed).content.trim();
}
