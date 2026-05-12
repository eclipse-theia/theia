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

import { Event } from '@theia/core';

/**
 * Generic lifecycle events that any AI agent backend can emit.
 * Backend-specific implementations map their native hook/event systems to these.
 */
export type AgentSessionHookEvent =
    | 'SessionStart'
    | 'SessionEnd'
    | 'PreToolUse'
    | 'PostToolUse'
    | 'PostToolUseFailure'
    | 'PostToolBatch'
    | 'UserPromptSubmit'
    | 'UserPromptExpansion'
    | 'PermissionRequest'
    | 'PermissionDenied'
    | 'InstructionsLoaded'
    | 'ConfigChange'
    | 'Notification'
    | 'Stop'
    | 'StopFailure'
    | 'Setup'
    | 'SubagentStart'
    | 'SubagentStop'
    | 'TaskCreated'
    | 'TaskCompleted'
    | 'TeammateIdle'
    | 'CwdChanged'
    | 'FileChanged'
    | 'WorktreeCreate'
    | 'WorktreeRemove'
    | 'PreCompact'
    | 'PostCompact'
    | 'Elicitation'
    | 'ElicitationResult';

export interface AgentSessionHookData {
    /** Which lifecycle event fired */
    event: AgentSessionHookEvent;
    /** The session/stream identifier */
    sessionId: string;
    /** Tool name, if this is a tool-related event */
    toolName?: string;
    /** Tool input, if this is a tool-related event */
    toolInput?: Record<string, unknown>;
    /** Arbitrary backend-specific payload */
    payload?: Record<string, unknown>;
}

/**
 * Contribution point for agent backends to emit lifecycle hook events.
 * Each backend (Claude Code, Ollama, Gemini, etc.) can provide its own implementation
 * that maps its native event system to these generic events.
 */
export const AgentSessionHookProvider = Symbol('AgentSessionHookProvider');
export interface AgentSessionHookProvider {
    /** Unique identifier for this provider (e.g. 'claude-code', 'ollama') */
    readonly id: string;

    /** Fired when a hook event occurs */
    readonly onHookEvent: Event<AgentSessionHookData>;
}

/**
 * Registry that aggregates all AgentSessionHookProvider contributions
 * and exposes a unified event stream.
 */
export const AgentSessionHookRegistry = Symbol('AgentSessionHookRegistry');
export interface AgentSessionHookRegistry {
    /** Unified event stream from all registered providers */
    readonly onHookEvent: Event<AgentSessionHookData>;
}
