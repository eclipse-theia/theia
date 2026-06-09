// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const QAIQ_AGENT_ID = 'qaiq';
const LEGACY_OPENCLAUDE_AGENT_ID = 'openclaude';

export function isQaiqAgent(agentId: string | undefined): boolean {
    const normalized = agentId?.trim().toLowerCase();
    return normalized === QAIQ_AGENT_ID || normalized === LEGACY_OPENCLAUDE_AGENT_ID;
}

export function isOpencodeAgent(agentId: string | undefined): boolean {
    return agentId?.trim().toLowerCase() === 'opencode';
}

export function isClaudeCodeAgent(agentId: string | undefined): boolean {
    return agentId?.trim().toLowerCase() === 'claude';
}

export function isCodexAgent(agentId: string | undefined): boolean {
    return agentId?.trim().toLowerCase() === 'codex';
}

export function isAntigravityAgent(agentId: string | undefined): boolean {
    const normalized = agentId?.trim().toLowerCase();
    return normalized === 'antigravity' || normalized === 'gemini';
}

/** VPS agents whose stdout is parsed into thinking / tool / text transcript segments. */
export function usesStructuredAgentTranscript(agentId: string | undefined): boolean {
    return isQaiqAgent(agentId)
        || isOpencodeAgent(agentId)
        || isClaudeCodeAgent(agentId)
        || isCodexAgent(agentId)
        || isAntigravityAgent(agentId);
}
