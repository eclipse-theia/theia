// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Idempotency marker so re-running a prompt through the runner does not stack context blocks. */
export const QAAP_TASK_CONTEXT_MARKER = '[QAAP task context]';

/** Notice appended when project-info is truncated, so the agent knows content was dropped. */
export const QAAP_PROJECT_INFO_TRUNCATION_NOTICE = '\n\n…(project-info truncated)';

/**
 * Truncates the per-project info artifact to a character budget without cutting mid-line.
 *
 * A blind `slice(0, max)` can end in the middle of a word or code span, leaving the agent with a
 * broken final sentence. Instead, when over budget, cut back to the last line break so the result
 * never ends mid-line, and append a clear truncation notice. The notice is included in the budget,
 * so the returned string never exceeds `maxChars`.
 */
export function truncateProjectInfo(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
        return text;
    }
    const budget = Math.max(0, maxChars - QAAP_PROJECT_INFO_TRUNCATION_NOTICE.length);
    let cut = text.slice(0, budget);
    const lineBreak = cut.lastIndexOf('\n');
    if (lineBreak > 0) {
        cut = cut.slice(0, lineBreak);
    }
    return `${cut.trimEnd()}${QAAP_PROJECT_INFO_TRUNCATION_NOTICE}`;
}

/**
 * Prepends important project context to a background-agent prompt, for ALL agents.
 *
 * Cloud agents are CLIs spawned in the workspace and never read Theia's PromptService, so context
 * has to ride on the prompt itself. Two sources are combined, whichever are present:
 *   - `globalContext`: cross-project Qaap context, resolved on the frontend from the editable
 *     `qaap-tasks-background-context` fragment and forwarded in the create request body.
 *   - `projectInfo`: the per-project `.prompts/project-info.prompttemplate` artifact, read from the
 *     workspace `cwd` by the runner.
 *
 * Returns the prompt unchanged when there is nothing to add or the marker is already present.
 */
export function prependAgentTaskContextToPrompt(prompt: string, globalContext?: string, projectInfo?: string): string {
    if (prompt.includes(QAAP_TASK_CONTEXT_MARKER)) {
        return prompt;
    }
    const parts: string[] = [];
    const global = globalContext?.trim();
    if (global) {
        parts.push(global);
    }
    const project = projectInfo?.trim();
    if (project) {
        parts.push(`# Project context\n\n${project}`);
    }
    if (parts.length === 0) {
        return prompt;
    }
    return `${QAAP_TASK_CONTEXT_MARKER}\n${parts.join('\n\n')}\n\n---\n\n${prompt}`;
}
