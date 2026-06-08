// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAgentApprovalPolicyId } from '@theia/qaap-mobile-shell/lib/common/qaap-sticky-composer-approval-policy';
import {
    formatQaiqInteractionFlags,
    qaiqCommandUsesInteractionFlags,
    type QaapQaiqInteractionFlagOptions,
} from '@theia/qaap-mobile-shell/lib/common/qaap-qaiq-interaction-flags';
import {
    applyAutoApproveToCommand,
    commandHasAutoApproveFlags,
} from './qaap-agent-auto-approve';
import type { QaapAgentToolApprovalRules } from './qaap-agent-conversation';

export type { QaapAgentToolApprovalRules };

export const DEFAULT_APPROVE_FOR_ME_TOOL_RULES: QaapAgentToolApprovalRules = {
    shell: false,
    network: false,
};

export interface QaapAgentApprovalFlagOptions {
    readonly agentId: string | undefined;
    readonly approvalPolicyId?: QaapAgentApprovalPolicyId;
    readonly autoApprove?: boolean;
    readonly interactionModeId?: string;
    readonly toolApprovalRules?: QaapAgentToolApprovalRules;
}

export function resolveEffectiveToolApprovalRules(
    policyId: QaapAgentApprovalPolicyId | undefined,
    rules: QaapAgentToolApprovalRules | undefined,
): QaapAgentToolApprovalRules | undefined {
    const policy = policyId ?? 'approve-for-me';
    if (policy === 'request-approval') {
        return { shell: false, network: false };
    }
    if (policy === 'full-access') {
        return { shell: true, network: true };
    }
    return {
        shell: rules?.shell ?? DEFAULT_APPROVE_FOR_ME_TOOL_RULES.shell,
        network: rules?.network ?? DEFAULT_APPROVE_FOR_ME_TOOL_RULES.network,
    };
}

/** Whether the VPS task should stay interactive (stdin approvals) for this preset. */
export function shouldUseInteractiveAgentApprovals(options: QaapAgentApprovalFlagOptions): boolean {
    return options.autoApprove === false || options.approvalPolicyId === 'request-approval';
}

/**
 * Apply composer approval presets to an agent command. Replaces the old binary auto-approve injection
 * so {@code approve-for-me} can auto-approve edits while still prompting for shell/network when configured.
 */
export function applyAgentApprovalPolicyToCommand(
    command: string,
    options: QaapAgentApprovalFlagOptions,
): string {
    if (shouldUseInteractiveAgentApprovals(options)) {
        return stripNonInteractiveApprovalFlags(command, options.agentId);
    }
    if (commandHasAutoApproveFlags(command) && options.approvalPolicyId === 'full-access') {
        return command;
    }
    const agentId = options.agentId?.trim().toLowerCase();
    const policyId = options.approvalPolicyId ?? 'approve-for-me';
    const rules = resolveEffectiveToolApprovalRules(policyId, options.toolApprovalRules);
    if (agentId === 'qaiq' || /\b(qaiq|openclaude)\b/.test(command)) {
        return applyQaiqApprovalFlags(command, options, policyId, rules);
    }
    if (agentId === 'claude' || /\bclaude\b/.test(command)) {
        return applyClaudeApprovalFlags(command, policyId, rules);
    }
    if (agentId === 'codex' || /\bcodex\b/.test(command)) {
        return applyCodexApprovalFlags(command, policyId, rules);
    }
    if (agentId === 'opencode' || /\bopencode(?:\s+run)?\b/.test(command)) {
        return applyOpencodeApprovalFlags(command, policyId, rules);
    }
    if (policyId === 'full-access' || rules?.network) {
        return applyAutoApproveToCommand(command, agentId);
    }
    return command;
}

function applyQaiqApprovalFlags(
    command: string,
    options: QaapAgentApprovalFlagOptions,
    policyId: QaapAgentApprovalPolicyId,
    rules: QaapAgentToolApprovalRules | undefined,
): string {
    const withoutLegacy = stripFlagToken(command, '--dangerously-skip-permissions');
    if (policyId === 'approve-for-me' && rules) {
        const flags = formatQaiqApproveForMeFlags(rules);
        return injectAfterPattern(withoutLegacy, /\b(qaiq|openclaude)\b/, flags);
    }
    const qaiqOptions: QaapQaiqInteractionFlagOptions = {
        interactionModeId: options.interactionModeId,
        approvalPolicyId: policyId,
        autoApprove: true,
    };
    const flags = formatQaiqInteractionFlags(qaiqOptions);
    if (!flags) {
        return withoutLegacy;
    }
    return injectAfterPattern(withoutLegacy, /\b(qaiq|openclaude)\b/, flags);
}

function formatQaiqApproveForMeFlags(rules: QaapAgentToolApprovalRules): string {
    if (rules.network) {
        return '--permission-mode bypassPermissions';
    }
    if (rules.shell) {
        return '--permission-mode default --allowed-tools Edit Write NotebookEdit Bash';
    }
    return '--permission-mode acceptEdits';
}

function applyClaudeApprovalFlags(
    command: string,
    policyId: QaapAgentApprovalPolicyId,
    rules: QaapAgentToolApprovalRules | undefined,
): string {
    let next = stripClaudeApprovalFlags(command);
    if (policyId === 'full-access' || rules?.network) {
        return injectAfterExecutable(next, 'claude', '--dangerously-skip-permissions');
    }
    if (policyId === 'approve-for-me' && rules?.shell) {
        return injectAfterExecutable(next, 'claude', '--permission-mode default --allowed-tools Edit Write NotebookEdit Bash');
    }
    if (policyId === 'approve-for-me') {
        return injectAfterExecutable(next, 'claude', '--permission-mode acceptEdits');
    }
    return injectAfterExecutable(next, 'claude', '--permission-mode default');
}

function applyCodexApprovalFlags(
    command: string,
    policyId: QaapAgentApprovalPolicyId,
    rules: QaapAgentToolApprovalRules | undefined,
): string {
    let next = stripCodexApprovalFlags(command);
    if (policyId === 'full-access' || rules?.network) {
        return injectAfterExecutable(next, 'codex', '--dangerously-bypass-approvals-and-sandbox');
    }
    if (policyId === 'approve-for-me' && rules?.shell) {
        return injectAfterExecutable(next, 'codex', '--sandbox workspace-write --ask-for-approval untrusted');
    }
    if (policyId === 'approve-for-me') {
        return injectAfterExecutable(next, 'codex', '--full-auto');
    }
    return next;
}

function applyOpencodeApprovalFlags(
    command: string,
    policyId: QaapAgentApprovalPolicyId,
    rules: QaapAgentToolApprovalRules | undefined,
): string {
    const next = stripFlagToken(command, '--dangerously-skip-permissions');
    if (policyId === 'full-access' || rules?.network || rules?.shell) {
        return injectAfterPattern(next, /\bopencode(?:\s+run)?\b/, '--dangerously-skip-permissions');
    }
    return next;
}

function stripNonInteractiveApprovalFlags(command: string, agentId: string | undefined): string {
    const id = agentId?.trim().toLowerCase();
    if (id === 'qaiq' || /\b(qaiq|openclaude)\b/.test(command)) {
        if (qaiqCommandUsesInteractionFlags(command)) {
            return injectAfterPattern(
                stripFlagToken(command, '--dangerously-skip-permissions'),
                /\b(qaiq|openclaude)\b/,
                '--permission-mode default',
            );
        }
    }
    if (id === 'claude' || /\bclaude\b/.test(command)) {
        return injectAfterExecutable(stripClaudeApprovalFlags(command), 'claude', '--permission-mode default');
    }
    if (id === 'codex' || /\bcodex\b/.test(command)) {
        return stripCodexApprovalFlags(command);
    }
    return command;
}

function stripClaudeApprovalFlags(command: string): string {
    return stripFlagTokens(command, [
        '--dangerously-skip-permissions',
        /--permission-mode\s+(?:default|acceptEdits|bypassPermissions|plan|dontAsk)\b/g,
        /--allowed-tools\s+[^\s]+(?:\s+[^\s-][^\s]*)*/g,
        /--disallowed-tools\s+[^\s]+(?:\s+[^\s-][^\s]*)*/g,
    ]);
}

function stripCodexApprovalFlags(command: string): string {
    return stripFlagTokens(command, [
        '--full-auto',
        '--dangerously-bypass-approvals-and-sandbox',
        '--yolo',
        /--sandbox\s+(?:read-only|workspace-write|danger-full-access)\b/g,
        /--ask-for-approval\s+(?:untrusted|on-request|never|unless-trusted)\b/g,
    ]);
}

function stripFlagToken(command: string, flag: string): string {
    const pattern = new RegExp(`(?:^|\\s)${escapeRegExp(flag)}(?=\\s|$)`, 'g');
    return command.replace(pattern, ' ').replace(/\s{2,}/g, ' ').trim();
}

function stripFlagTokens(command: string, patterns: Array<string | RegExp>): string {
    let next = command;
    for (const pattern of patterns) {
        next = typeof pattern === 'string'
            ? stripFlagToken(next, pattern)
            : next.replace(pattern, ' ').replace(/\s{2,}/g, ' ').trim();
    }
    return next;
}

function injectAfterExecutable(command: string, executable: string, flag: string): string {
    return injectAfterPattern(command, new RegExp(`\\b${escapeRegExp(executable)}\\b`), flag);
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
