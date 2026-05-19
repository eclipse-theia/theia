// *****************************************************************************
// Copyright (C) 2026 Ericsson and Others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export type HookEvent =
    | 'SessionStart' | 'Setup' | 'InstructionsLoaded'
    | 'UserPromptSubmit' | 'UserPromptExpansion'
    | 'PreToolUse' | 'PermissionRequest' | 'PermissionDenied'
    | 'PostToolUse' | 'PostToolUseFailure' | 'PostToolBatch'
    | 'Notification' | 'SubagentStart' | 'SubagentStop'
    | 'TaskCreated' | 'TaskCompleted'
    | 'Stop' | 'StopFailure' | 'TeammateIdle'
    | 'ConfigChange' | 'CwdChanged' | 'FileChanged'
    | 'WorktreeCreate' | 'WorktreeRemove'
    | 'PreCompact' | 'PostCompact'
    | 'Elicitation' | 'ElicitationResult'
    | 'SessionEnd';

export type HookHandlerType = 'command' | 'http';

export interface HookHandler {
    type: HookHandlerType;
    timeout?: number;
}

export interface CommandHookHandler extends HookHandler {
    type: 'command';
    command: string;
}

export interface HttpHookHandler extends HookHandler {
    type: 'http';
    url: string;
}

export interface MatcherGroup {
    matcher: string;
    hooks: Array<CommandHookHandler | HttpHookHandler>;
}

export interface HooksConfig {
    hooks: Partial<Record<HookEvent, MatcherGroup[]>>;
}

/**
 * Callback event sent from a Claude Code hook to Theia's HTTP callback server.
 */
export interface HookCallbackEvent {
    hookEvent: HookEvent;
    payload: Record<string, unknown>;
}

export const CLAUDE_CODE_HOOK_SERVICE_PATH = '/services/claude-code-hooks';

export const ClaudeCodeHookClient = Symbol('ClaudeCodeHookClient');
export interface ClaudeCodeHookClient {
    onHookEvent(event: HookCallbackEvent): void;
}

export const ClaudeCodeHookService = Symbol('ClaudeCodeHookService');
export interface ClaudeCodeHookService {
    installHooks(cwd: string): Promise<void>;
    getCallbackPort(): number;
}
