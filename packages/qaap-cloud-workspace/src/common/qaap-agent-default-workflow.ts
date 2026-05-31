// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const SHELL_AGENT_ID = 'shell';
const DEFAULT_WORKFLOW_MARKER = '[QAAP default agent workflow]';

export function buildAgentDefaultWorkflowPromptBlock(): string {
    return [
        DEFAULT_WORKFLOW_MARKER,
        'For coding tasks, work toward a reviewable pull request by default unless the user asks for a different outcome.',
        'Use the current repository context, inspect git status before changing files, and create or use an appropriate branch for the task.',
        'Implement the change, run the most relevant verification you can find, and summarize the result with changed files and test status.',
        'When GitHub credentials and remotes are available, push the branch and open or update a PR. Otherwise leave the branch PR-ready and state the exact next command or blocker.',
        'Do not merge, delete branches, or rewrite shared history unless the user explicitly asks.',
    ].join('\n');
}

export function appendAgentDefaultWorkflowToPrompt(prompt: string, agentId: string): string {
    if (agentId === SHELL_AGENT_ID || prompt.includes(DEFAULT_WORKFLOW_MARKER)) {
        return prompt;
    }
    return `${buildAgentDefaultWorkflowPromptBlock()}\n\n---\n\n${prompt}`;
}
