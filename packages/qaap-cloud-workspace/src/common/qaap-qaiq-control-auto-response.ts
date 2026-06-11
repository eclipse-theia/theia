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
 * Headless QAIQ stdio runs cannot block on the mobile approvals UI when the composer
 * preset is auto-approve. Resolve allow/deny immediately from the spawned CLI flags.
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
    const allowedTools = parseAllowedTools(command);
    if (allowedTools) {
        return allowedTools.has(toolName) ? 'allow' : 'deny';
    }
    if (isNetworkTool(toolName) || isShellTool(toolName) || isSubagentTool(toolName)) {
        return 'deny';
    }
    return 'allow';
}

export function buildQaiqNetworkToolDenialMessage(toolName: string): string {
    return `${toolName} is not auto-approved under the current approval policy. `
        + 'Enable network or shell access in the composer approval settings, switch to Full access, '
        + 'or ask the agent to continue without web search.';
}
