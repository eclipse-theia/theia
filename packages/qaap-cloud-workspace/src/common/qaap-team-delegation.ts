// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const SHELL_AGENT_ID = 'shell';

/**
 * Prompt block injected into leader agent turns so they can fan out work via the `qaap-task`
 * helper — a lightweight alternative to AionUi's full ACP orchestration layer.
 */
export function buildTeamDelegationPromptBlock(availableAgentIds: readonly string[]): string {
    const agents = availableAgentIds.filter(id => id !== SHELL_AGENT_ID);
    const agentHint = agents.length > 0
        ? `Available --agent values: ${agents.join(', ')}.`
        : '';
    return [
        '[Team delegation — qaap-task]',
        'You are the leader for this turn. To delegate independent sub-tasks to background agents, run:',
        '  qaap-task [--agent <id>] "<prompt>"',
        'Sub-tasks run detached on the VPS; parentId is set automatically. The command prints the new task id and exits (fire-and-forget).',
        'Use delegation for parallelizable work only — keep sequential steps in this turn.',
        'When sub-tasks finish, their stdout is stored server-side; mention spawned task ids in your reply.',
        agentHint,
    ].filter(Boolean).join('\n');
}

/** Append the team-delegation block to an agent prompt (no-op for shell commands). */
export function appendTeamDelegationToPrompt(
    prompt: string,
    turnAgentId: string,
    availableAgentIds: readonly string[],
): string {
    if (turnAgentId === SHELL_AGENT_ID) {
        return prompt;
    }
    const block = buildTeamDelegationPromptBlock(availableAgentIds);
    return `${block}\n\n---\n\n${prompt}`;
}
