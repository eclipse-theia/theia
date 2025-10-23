// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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

/**
 * Type definitions for the OpenAI Codex SDK.
 * These types mirror the SDK's runtime behavior for compile-time type checking.
 * The actual SDK is installed globally and dynamically imported at runtime.
 */

export interface SDKEventBase {
    type: string;
}

export interface ItemStartedEvent extends SDKEventBase {
    type: 'item.started';
    item: {
        type: string;
        [key: string]: unknown;
    };
}

export interface ItemCompletedEvent extends SDKEventBase {
    type: 'item.completed';
    item: CommandExecutionItem | AgentMessageItem | { type: string;[key: string]: unknown };
}

export interface TurnCompletedEvent extends SDKEventBase {
    type: 'turn.completed';
    usage: TokenUsage;
}

export interface TurnFailedEvent extends SDKEventBase {
    type: 'turn.failed';
    error: {
        message: string;
        code?: string;
    };
}

export type StreamEvent = ItemStartedEvent | ItemCompletedEvent | TurnCompletedEvent | TurnFailedEvent;

export interface CommandExecutionItem {
    type: 'command_execution';
    command: string;
    exit_code: number;
    aggregated_output: string;
}

export interface AgentMessageItem {
    type: 'agent_message';
    text: string;
}

export interface TokenUsage {
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens?: number;
}

export interface CodexOptions {
    workingDirectory?: string;
    skipGitRepoCheck?: boolean;
    outputSchema?: Record<string, unknown>;
    sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access';
}
