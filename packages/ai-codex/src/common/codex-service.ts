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

// Import from local type declarations (not from SDK package)
import type {
    StreamEvent,
    ItemStartedEvent as SDKItemStartedEvent,
    ItemCompletedEvent as SDKItemCompletedEvent,
    TurnCompletedEvent as SDKTurnCompletedEvent,
    TurnFailedEvent as SDKTurnFailedEvent,
    CommandExecutionItem as SDKCommandExecutionItem,
    AgentMessageItem as SDKAgentMessageItem,
    CodexOptions
} from './codex-sdk-types';

// Re-export SDK types for convenience
export type {
    StreamEvent,
    ItemStartedEvent,
    ItemCompletedEvent,
    TurnCompletedEvent,
    TurnFailedEvent,
    CommandExecutionItem,
    AgentMessageItem,
    TokenUsage,
    CodexOptions
} from './codex-sdk-types';

/**
 * Type guard for ItemStartedEvent.
 */
export namespace ItemStartedEvent {
    export function is(obj: unknown): obj is SDKItemStartedEvent {
        return typeof obj === 'object' && obj !== undefined &&
            (obj as { type: string }).type === 'item.started';
    }
}

export const CODEX_SERVICE_PATH = '/services/codex';

/**
 * Request sent from frontend to backend to invoke Codex SDK.
 */
export interface CodexRequest {
    prompt: string;
    options?: Partial<CodexOptions>;
}

/**
 * Extended request with backend-specific configuration.
 */
export interface CodexBackendRequest extends CodexRequest {
    apiKey?: string;
    codexPath?: string; // Custom path to Codex SDK
}

/**
 * Client interface for backend -> frontend communication.
 */
export const CodexClient = Symbol('CodexClient');
export interface CodexClient {
    /**
     * Send a streaming token or message to the frontend.
     * @param streamId Stream identifier
     * @param token Message to send, or `undefined` to signal end of stream
     */
    sendToken(streamId: string, token?: StreamEvent): void;

    /**
     * Send an error to the frontend.
     * @param streamId Stream identifier
     * @param error Error object
     */
    sendError(streamId: string, error: Error): void;
}

/**
 * Service interface for frontend -> backend communication.
 */
export const CodexService = Symbol('CodexService');
export interface CodexService {
    /**
     * Send a request to Codex SDK.
     * @param request Request parameters
     * @param streamId Pre-generated stream ID for tracking streaming responses
     */
    send(request: CodexBackendRequest, streamId: string): Promise<void>;

    /**
     * Cancel a running request to Codex SDK.
     * @param streamId Stream ID identifying the request
     */
    cancel(streamId: string): void;
}

/**
 * Alias for stream messages (for backward compatibility).
 */
export type StreamMessage = StreamEvent;

/**
 * Type guard for ItemCompletedEvent.
 */
export namespace ItemCompletedEvent {
    export function is(obj: unknown): obj is SDKItemCompletedEvent {
        return typeof obj === 'object' && obj !== undefined &&
            (obj as { type: string }).type === 'item.completed';
    }
}

/**
 * Type guard for TurnCompletedEvent.
 */
export namespace TurnCompletedEvent {
    export function is(obj: unknown): obj is SDKTurnCompletedEvent {
        return typeof obj === 'object' && obj !== undefined &&
            (obj as { type: string }).type === 'turn.completed';
    }
}

/**
 * Type guard for TurnFailedEvent.
 */
export namespace TurnFailedEvent {
    export function is(obj: unknown): obj is SDKTurnFailedEvent {
        return typeof obj === 'object' && obj !== undefined &&
            (obj as { type: string }).type === 'turn.failed';
    }
}

/**
 * Type guard for CommandExecutionItem.
 */
export namespace CommandExecutionItem {
    export function is(obj: unknown): obj is SDKCommandExecutionItem {
        return typeof obj === 'object' && obj !== undefined &&
            (obj as SDKCommandExecutionItem).type === 'command_execution';
    }
}

/**
 * Type guard for AgentMessageItem.
 */
export namespace AgentMessageItem {
    export function is(obj: unknown): obj is SDKAgentMessageItem {
        return typeof obj === 'object' && obj !== undefined &&
            (obj as SDKAgentMessageItem).type === 'agent_message';
    }
}
