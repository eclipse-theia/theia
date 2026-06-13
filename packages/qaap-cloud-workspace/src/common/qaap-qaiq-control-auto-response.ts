// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { findQaiqDevServerGuardDenial } from './qaap-agent-dev-server-guard';
import type { QaapQaiqPendingControlRequest } from './qaap-qaiq-stdio-approvals';

export type QaapQaiqControlAutoAction = 'allow' | 'deny' | 'queue';

const NETWORK_TOOL_NAMES = new Set(['WebSearch', 'WebFetch', 'Fetch']);
const SHELL_TOOL_NAMES = new Set(['Bash', 'Shell', 'ShellCommand', 'run_terminal_cmd']);
const SUBAGENT_TOOL_NAMES = new Set(['Agent', 'Task']);

function parseAllowedTools(command: string): Set<string> | undefined {
    const match = /--allowed-tools\s+([^\s-][^\s]*)/.exec(command);
    if (!match?.[1]) {
        return undefined;
    }
    return new Set(match[1].split(',').map(tool => tool.trim()).filter(Boolean));
}

function isNetworkTool(toolName: string): boolean {
    return NETWORK_TOOL_NAMES.has(toolName.trim());
}

function isShellTool(toolName: string): boolean {
    return SHELL_TOOL_NAMES.has(toolName.trim());
}

function isSubagentTool(toolName: string): boolean {
    return SUBAGENT_TOOL_NAMES.has(toolName.trim());
}

/**
 * Resolve a QAIQ stdio `control_request` against the spawned CLI flags.
 *
 * Tools the policy auto-allows resolve immediately; gated shell/network tools are
 * queued to the approvals UI so the user can grant them mid-turn (the runner applies
 * a grace timeout so an unattended run still finishes). Only subagents and the
 * dev-server guard auto-deny — those can never be approved interactively.
 */
export function resolveQaiqControlRequestAutoAction(
    command: string,
    autoApprove: boolean | undefined,
    request: QaapQaiqPendingControlRequest,
): QaapQaiqControlAutoAction {
    if (autoApprove === false) {
        return 'queue';
    }
    if (findQaiqDevServerGuardDenial(request)) {
        return 'deny';
    }
    if (/(?:^|\s)--permission-mode\s+bypassPermissions(?:\s|$)/.test(command)) {
        return 'allow';
    }
    const toolName = request.toolName?.trim() ?? '';
    if (!toolName) {
        return 'allow';
    }
    // Subagents bypass the stdio control protocol once running, so approving them
    // interactively cannot work — deny with guidance instead.
    if (isSubagentTool(toolName)) {
        return 'deny';
    }
    const allowedTools = parseAllowedTools(command);
    if (allowedTools) {
        return allowedTools.has(toolName) ? 'allow' : 'queue';
    }
    if (isNetworkTool(toolName) || isShellTool(toolName)) {
        return 'queue';
    }
    return 'allow';
}

/** Deny guidance for tools that can never be approved mid-turn (subagents). */
export function buildQaiqAutoDeniedToolMessage(toolName: string): string {
    return `${toolName} is not available in this run. `
        + 'Do the work directly in this conversation instead of delegating to a subagent, '
        + 'and do not retry the call unchanged.';
}

/** Deny guidance when a queued approval expired without a user response. */
export function buildQaiqQueuedApprovalTimeoutMessage(toolName: string): string {
    return `${toolName} was not approved in time under the current approval policy. `
        + 'Continue without it, or tell the user they can enable shell/network access in the '
        + 'composer approval settings or switch to Full access and ask you to retry.';
}
