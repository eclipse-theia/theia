// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentMessageDTO } from './qaap-agent-conversation-client';
import { isTranscriptTodoTool, parseTranscriptTodoChecklist, resolveTranscriptActivityStats } from './qaap-agent-transcript-segments';
import { extractDevPreviewUrlFromAgentText, messageRequestsDevPreview } from './qaap-transcript-preview-offer';

const ACTIONABLE_TASK_RE = /\b(?:fix|explore|implement|build|run|test|debug|review|refactor|add|create|update|install|deploy|figure\s+out)\b/i;
const PLANNING_TEXT_RE = /\b(?:let me|i will|i'll|i am going to|going to (?:start|explore|check|look|figure)|need to (?:explore|check|understand|figure)|start by (?:exploring|looking|checking|understanding))\b/i;
const TASK_OUTCOME_TEXT_RE = /\b(?:done|completed|finished|ready on port|listening on|running (?:at|on)|installed|dependencies (?:are )?ready|node_modules|here(?:'s| is) the url|preview(?:\s+is)?(?:\s+)?ready|dev server)\b/i;

/** User message that expects the agent to run tools, not stop after planning. */
export function isActionableAgentTaskMessage(text: string | undefined): boolean {
    if (!text?.trim()) {
        return false;
    }
    return messageRequestsDevPreview(text) || ACTIONABLE_TASK_RE.test(text);
}

function collectAgentVisibleText(agentMessage: QaapAgentMessageDTO): string {
    const parts: string[] = [];
    if (agentMessage.content?.trim()) {
        parts.push(agentMessage.content.trim());
    }
    for (const segment of agentMessage.segments ?? []) {
        if ((segment.type === 'text' || segment.type === 'thinking') && segment.content?.trim()) {
            parts.push(segment.content.trim());
        }
    }
    return parts.join('\n');
}

function agentTextLooksLikePlanningOnly(text: string | undefined): boolean {
    const normalized = text?.trim();
    if (!normalized) {
        return false;
    }
    return PLANNING_TEXT_RE.test(normalized) && !TASK_OUTCOME_TEXT_RE.test(normalized);
}

function isExploreOnlyTaskMessage(userContent: string | undefined): boolean {
    const text = userContent?.trim() ?? '';
    if (!text || messageRequestsDevPreview(text)) {
        return false;
    }
    return /\bexplore\b/i.test(text)
        && !/\b(?:build|run|install|fix|implement|deploy|start|figure\s+out)\b/i.test(text);
}

/** True when the latest TodoWrite checklist still has pending or in-progress items. */
export function agentMessageHasOpenTodos(agentMessage: QaapAgentMessageDTO | undefined): boolean {
    if (!agentMessage?.segments?.length) {
        return false;
    }
    let latestTodoArgs: string | undefined;
    for (const segment of agentMessage.segments) {
        if (segment.type === 'tool' && segment.finished && isTranscriptTodoTool(segment.name) && segment.args) {
            latestTodoArgs = segment.args;
        }
    }
    if (!latestTodoArgs) {
        return false;
    }
    const checklist = parseTranscriptTodoChecklist(latestTodoArgs);
    return !!checklist?.some(item => item.status !== 'completed');
}

/** True when the agent produced a concrete outcome for the user request. */
export function agentMessageDeliversTaskOutcome(
    userContent: string | undefined,
    agentMessage: QaapAgentMessageDTO | undefined,
): boolean {
    if (!agentMessage || agentMessage.role !== 'agent') {
        return false;
    }
    if (agentMessageHasOpenTodos(agentMessage)) {
        return false;
    }
    const text = collectAgentVisibleText(agentMessage);
    const stats = resolveTranscriptActivityStats(agentMessage.segments ?? []);
    if (messageRequestsDevPreview(userContent)) {
        if (extractDevPreviewUrlFromAgentText(text)) {
            return true;
        }
        if (TASK_OUTCOME_TEXT_RE.test(text)) {
            return true;
        }
        return stats.shells > 0;
    }
    if (stats.shells > 0 || stats.edits > 0) {
        return true;
    }
    if (!text) {
        return false;
    }
    if (isExploreOnlyTaskMessage(userContent)) {
        return !agentTextLooksLikePlanningOnly(text);
    }
    if (agentTextLooksLikePlanningOnly(text)) {
        return false;
    }
    if (stats.searches + stats.fileReads + stats.otherTools > 0 && stats.shells + stats.edits === 0) {
        return false;
    }
    return !!text.trim();
}

/** True when the agent ended the turn without tools or a real answer. */
export function isIncompleteAgentTurn(
    userContent: string | undefined,
    agentMessage: QaapAgentMessageDTO | undefined,
): boolean {
    if (!isActionableAgentTaskMessage(userContent) || !agentMessage || agentMessage.role !== 'agent') {
        return false;
    }
    if (agentMessageDeliversTaskOutcome(userContent, agentMessage)) {
        return false;
    }
    const segments = agentMessage.segments;
    if (segments?.length) {
        const hasUnfinishedTool = segments.some(segment => segment.type === 'tool' && !segment.finished);
        if (hasUnfinishedTool) {
            return true;
        }
        return true;
    }
    const content = agentMessage.content?.trim();
    return !content || content === '…';
}

export function buildAgentAutoContinuePrompt(userContent?: string): string {
    if (messageRequestsDevPreview(userContent)) {
        return 'Continue this task now. Complete every remaining todo item, inspect package.json, install dependencies with one-shot Bash if needed, fix build issues, '
            + 'and confirm the dev server port for preview. Do not stop after search, read, or planning text.';
    }
    return 'Continue this task now. Complete every remaining todo item, use Read, Glob, or Grep to inspect the repo, then Bash for one-shot commands. '
        + 'Do not stop after planning, searching, or thinking — finish the user request and report concrete results.';
}
