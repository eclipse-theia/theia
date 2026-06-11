// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const SHELL_AGENT_ID = 'shell';
const DEFAULT_WORKFLOW_MARKER = '[QAAP default agent workflow]';
const DEV_PREVIEW_MARKER = '[QAAP dev preview]';

export function buildAgentDefaultWorkflowPromptBlock(): string {
    return [
        DEFAULT_WORKFLOW_MARKER,
        'For coding tasks, work toward a reviewable pull request by default unless the user asks for a different outcome.',
        'Use the current repository context, inspect git status before changing files, and create or use an appropriate branch for the task.',
        'Start every task by using Read, Glob, or Grep on the repository — never end a turn with only planning/thinking text.',
        'Implement the change, run the most relevant verification you can find, and summarize the result with changed files and test status.',
        'When GitHub credentials and remotes are available, push the branch and open or update a PR. Otherwise leave the branch PR-ready and state the exact next command or blocker.',
        'Do not merge, delete branches, or rewrite shared history unless the user explicitly asks.',
    ].join('\n');
}

export function buildAgentDevPreviewPromptBlock(): string {
    return [
        DEV_PREVIEW_MARKER,
        'Qaap keeps the dev server alive in a dedicated IDE terminal with hot reload.',
        'Never run long-lived dev commands in shell (pnpm dev, npm start, vite, next dev, astro dev, etc.) — shell tools time out after ~30s and kill the preview.',
        'Use one-shot install/build/typecheck/test commands only. When the app should be previewable, reply with the expected local port (e.g. 5173) and confirm dependencies are installed; Qaap starts the server separately.',
    ].join('\n');
}

export function appendAgentDefaultWorkflowToPrompt(prompt: string, agentId: string): string {
    if (agentId === SHELL_AGENT_ID || prompt.includes(DEFAULT_WORKFLOW_MARKER)) {
        return prompt;
    }
    const blocks = [buildAgentDefaultWorkflowPromptBlock()];
    if (!prompt.includes(DEV_PREVIEW_MARKER)) {
        blocks.push(buildAgentDevPreviewPromptBlock());
    }
    return `${blocks.join('\n\n')}\n\n---\n\n${prompt}`;
}
