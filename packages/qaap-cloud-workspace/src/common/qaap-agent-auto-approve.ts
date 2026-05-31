// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Agent id for the built-in QAIQ runner (matches {@link QAIQ_AGENT_ID} in the task runner). */
export const QAAP_QAIQ_AGENT_ID = 'qaiq';

/**
 * Whether a background agent task should bypass CLI permission prompts.
 *
 * Background tasks are always non-interactive subprocesses — without auto-approve,
 * Claude Code / Codex hang waiting for TTY input. Default is on; set
 * `QAAP_AGENT_AUTO_APPROVE=0` on the server to opt out globally.
 */
export function resolveAgentAutoApprove(explicit?: boolean): boolean {
    if (explicit === false) {
        return false;
    }
    if (explicit === true) {
        return true;
    }
    const env = process.env.QAAP_AGENT_AUTO_APPROVE?.trim().toLowerCase();
    if (env === '0' || env === 'false' || env === 'no') {
        return false;
    }
    return true;
}

/** Routines are unattended by definition — only an explicit `false` disables YOLO. */
export function resolveRoutineAutoApprove(explicit?: boolean): boolean {
    return explicit !== false;
}

/** Per-conversation YOLO — same default as routines (`undefined` means on). */
export function resolveConversationAutoApprove(explicit?: boolean): boolean {
    return explicit !== false;
}

export function commandHasAutoApproveFlags(command: string): boolean {
    return /--dangerously-skip-permissions\b/.test(command)
        || /--permission-mode\s+(?:bypassPermissions|dontAsk)\b/.test(command)
        || /--full-auto\b/.test(command)
        || /--approval-mode\s+full-auto\b/.test(command)
        || /--auto-edit\b/.test(command)
        || /--dangerously-auto-approve-everything\b/.test(command)
        || /--yes-always\b/.test(command)
        || /\b--force\b/.test(command)
        || /\b-yolo\b/.test(command)
        || /--approval-mode(?:=|\s+)yolo\b/.test(command)
        || /--allow-all\b/.test(command)
        || /--autopilot\b/.test(command);
}

/**
 * Inject CLI flags so a background agent run does not block on permission prompts.
 * No-op when the command already carries an auto-approve flag.
 */
export function applyAutoApproveToCommand(command: string, agentId: string | undefined): string {
    if (commandHasAutoApproveFlags(command)) {
        return command;
    }
    const id = agentId?.trim().toLowerCase();
    if (id === 'claude') {
        return injectAfterExecutable(command, 'claude', '--dangerously-skip-permissions');
    }
    if (id === 'codex') {
        return injectAfterExecutable(command, 'codex', '--full-auto');
    }
    if (id === QAAP_QAIQ_AGENT_ID) {
        return injectAfterPattern(command, /\b(qaiq|openclaude)\b/, '--dangerously-skip-permissions');
    }
    if (id === 'aider') {
        return command;
    }
    if (id === 'opencode') {
        return injectAfterPattern(command, /\bopencode(?:\s+run)?\b/, '--dangerously-skip-permissions');
    }
    if (id === 'cursor') {
        return injectAfterExecutable(command, 'cursor-agent', '-p --force');
    }
    if (id === 'gemini') {
        if (/--approval-mode(?:=|\s+)yolo\b/.test(command) || /\b-y\b/.test(command)) {
            return command;
        }
        if (hasHeadlessPromptFlag(command)) {
            return injectAfterHeadlessPromptFlag(command, '--approval-mode=yolo');
        }
        return injectAfterExecutable(command, 'gemini', '-p --approval-mode=yolo');
    }
    if (id === 'copilot') {
        return injectAfterExecutable(command, 'copilot', '--autopilot --yolo --max-autopilot-continues 20');
    }
    if (id === 'qwen') {
        if (/--approval-mode(?:=|\s+)yolo\b/.test(command) || /\b-y\b/.test(command)) {
            return command;
        }
        if (hasHeadlessPromptFlag(command)) {
            return injectAfterHeadlessPromptFlag(command, '--approval-mode yolo');
        }
        return injectAfterExecutable(command, 'qwen', '-p --approval-mode yolo');
    }
    if (/\bclaude\b/.test(command)) {
        return injectAfterExecutable(command, 'claude', '--dangerously-skip-permissions');
    }
    if (/\bcodex\b/.test(command)) {
        return injectAfterExecutable(command, 'codex', '--full-auto');
    }
    if (/\b(qaiq|openclaude)\b/.test(command)) {
        return injectAfterPattern(command, /\b(qaiq|openclaude)\b/, '--dangerously-skip-permissions');
    }
    if (/\bopencode(?:\s+run)?\b/.test(command)) {
        return injectAfterPattern(command, /\bopencode(?:\s+run)?\b/, '--dangerously-skip-permissions');
    }
    if (/\bcursor-agent\b/.test(command)) {
        return injectAfterExecutable(command, 'cursor-agent', '-p --force');
    }
    if (/\bgemini\b/.test(command) && !commandHasAutoApproveFlags(command)) {
        if (hasHeadlessPromptFlag(command)) {
            return injectAfterHeadlessPromptFlag(command, '--approval-mode=yolo');
        }
        return injectAfterExecutable(command, 'gemini', '-p --approval-mode=yolo');
    }
    if (/\bcopilot\b/.test(command) && !commandHasAutoApproveFlags(command)) {
        return injectAfterExecutable(command, 'copilot', '--autopilot --yolo --max-autopilot-continues 20');
    }
    if (/\bqwen\b/.test(command) && !commandHasAutoApproveFlags(command)) {
        if (hasHeadlessPromptFlag(command)) {
            return injectAfterHeadlessPromptFlag(command, '--approval-mode yolo');
        }
        return injectAfterExecutable(command, 'qwen', '-p --approval-mode yolo');
    }
    return command;
}

function hasHeadlessPromptFlag(command: string): boolean {
    return /(?:^|\s)-p(?:\s|=|$)/.test(command) || /(?:^|\s)--prompt(?:\s|=|$)/.test(command);
}

function injectAfterHeadlessPromptFlag(command: string, flag: string): string {
    const shortPrompt = /(?:^|\s)-p(?=\s)/.exec(command);
    if (shortPrompt && shortPrompt.index !== undefined) {
        const insertAt = shortPrompt.index + shortPrompt[0].length;
        return `${command.slice(0, insertAt)} ${flag}${command.slice(insertAt)}`;
    }
    const longPrompt = /(?:^|\s)--prompt(?=\s|=)/.exec(command);
    if (longPrompt && longPrompt.index !== undefined) {
        const insertAt = longPrompt.index + longPrompt[0].length;
        return `${command.slice(0, insertAt)} ${flag}${command.slice(insertAt)}`;
    }
    return command;
}

function injectAfterExecutable(command: string, executable: string, flag: string): string {
    const pattern = new RegExp(`\\b${escapeRegExp(executable)}\\b`);
    return injectAfterPattern(command, pattern, flag);
}

function injectAfterPattern(command: string, executablePattern: RegExp, flag: string): string {
    const match = executablePattern.exec(command);
    if (!match || match.index === undefined) {
        return command;
    }
    const insertAt = match.index + match[0].length;
    return `${command.slice(0, insertAt)} ${flag}${command.slice(insertAt)}`;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
