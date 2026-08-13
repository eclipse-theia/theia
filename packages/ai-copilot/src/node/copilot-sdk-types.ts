// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

// The declarations in this file mirror the API of the GitHub Copilot SDK '@github/copilot-sdk' (1.0.9)
// - https://github.com/github/copilot-sdk
// '@github/copilot-sdk' copyright:
/*---------------------------------------------------------------------------------------------
 *  Copyright GitHub, Inc.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The part of the Copilot SDK API this integration uses, mirrored by hand.
 *
 * Mirrored from `@github/copilot-sdk` 1.0.9 (protocol version 3), which the Copilot CLI 1.0.79 ships.
 * The package is deliberately not a dependency: it depends on the CLI, a large proprietary binary that
 * would end up in the tree and the lockfile of every application. The CLI is a prerequisite on the
 * backend host instead, see `CopilotCliLocator`, and the SDK is loaded from it at runtime, see
 * `CopilotSdkLoader`.
 *
 * Only what this integration passes to the SDK or reads from it is declared, so a drift shows up as a
 * compile error here rather than at runtime. `scripts/copilot-sdk-mirror` checks the mirror against a
 * released SDK and runs in CI on a schedule; update the version above along with the declarations.
 */

// ============================================================================
// Models, from `dist/types.d.ts`
// ============================================================================

export interface ModelPolicy {
    state: 'enabled' | 'disabled' | 'unconfigured';
}

/** A model as reported by {@link CopilotClient.listModels}. */
export interface ModelInfo {
    /** Model identifier, for example `claude-sonnet-4.5`. */
    id: string;
    policy?: ModelPolicy;
}

// ============================================================================
// System message, from `dist/types.d.ts`
// ============================================================================

/** The sections the runtime assembles its system prompt from. Unknown ids are a silent no-op there. */
export type SystemMessageSection =
    | 'preamble'
    | 'identity'
    | 'tone'
    | 'tool_efficiency'
    | 'environment_context'
    | 'code_change_rules'
    | 'guidelines'
    | 'safety'
    | 'tool_instructions'
    | 'custom_instructions'
    | 'runtime_instructions'
    | 'last_instructions';

export type SectionTransformFn = (currentContent: string) => string | Promise<string>;

export type SectionOverrideAction = 'replace' | 'remove' | 'append' | 'prepend' | 'preserve' | SectionTransformFn;

export interface SectionOverride {
    action: SectionOverrideAction;
    content?: string;
}

/** The SDK foundation plus the given content. */
export interface SystemMessageAppendConfig {
    mode?: 'append';
    content?: string;
}

/** The given content as the entire system message. */
export interface SystemMessageReplaceConfig {
    mode: 'replace';
    content: string;
}

/** The SDK structure with section-level overrides, which is what this integration uses. */
export interface SystemMessageCustomizeConfig {
    mode: 'customize';
    sections?: Partial<Record<SystemMessageSection, SectionOverride>>;
    content?: string;
}

export type SystemMessageConfig = SystemMessageAppendConfig | SystemMessageReplaceConfig | SystemMessageCustomizeConfig;

// ============================================================================
// Tools, from `dist/types.d.ts`
// ============================================================================

/** What the runtime tells a tool handler about its invocation. */
export interface ToolInvocation {
    sessionId: string;
    toolCallId: string;
    toolName: string;
    arguments: unknown;
}

export type ToolHandler = (args: unknown, invocation: ToolInvocation) => Promise<unknown> | unknown;

/** A tool declared to the runtime. `parameters` also accepts a Zod schema upstream. */
export interface Tool {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
    handler?: ToolHandler;
    /** When true, the tool runs without a permission prompt of the runtime. */
    skipPermission?: boolean;
}

// ============================================================================
// Permissions, from `dist/types.d.ts` and `dist/generated/rpc.d.ts`
// ============================================================================

/**
 * A permission request of the runtime, upstream a union over the kind of operation with its own fields.
 * Only `managedApprovalRequired` is read, which managed policy sets for a request it reserves for the
 * user.
 */
export interface PermissionRequest {
    readonly kind: string;
    readonly managedApprovalRequired?: boolean;
}

/** The decisions this integration can return. Upstream also has scopes that outlive a request. */
export type PermissionRequestResult =
    | { kind: 'approve-once' }
    | { kind: 'reject', feedback?: string }
    /** No user is available to confirm the request. */
    | { kind: 'user-not-available' }
    /** Leaves the request pending, so that another connected client can answer it. */
    | { kind: 'no-result' };

export type PermissionHandler = (
    request: PermissionRequest,
    invocation: { sessionId: string, managedSettingsEnabled?: boolean }
) => Promise<PermissionRequestResult> | PermissionRequestResult;

// ============================================================================
// Session events, from `dist/generated/session-events.d.ts`
// ============================================================================

/** The envelope every session event comes in. */
export interface SessionEvent<T extends string, D> {
    readonly type: T;
    readonly data: D;
}

/** The session events this integration listens to, keyed by their type discriminator. */
export interface CopilotSessionEvents {
    'assistant.message_delta': SessionEvent<'assistant.message_delta', {
        readonly deltaContent: string
    }>;
    'assistant.reasoning_delta': SessionEvent<'assistant.reasoning_delta', {
        readonly deltaContent: string
    }>;
    'assistant.message': SessionEvent<'assistant.message', {
        readonly content: string,
        readonly outputTokens?: number
    }>;
    'assistant.usage': SessionEvent<'assistant.usage', {
        readonly inputTokens?: number,
        readonly outputTokens?: number
    }>;
    /** Nothing of its payload is read, the event itself is the signal that the turn is over. */
    'session.idle': SessionEvent<'session.idle', unknown>;
    'session.error': SessionEvent<'session.error', {
        readonly errorType: string,
        readonly message: string,
        readonly statusCode?: number,
        readonly stack?: string
    }>;
}

export type CopilotSessionEventType = keyof CopilotSessionEvents;

// ============================================================================
// Session, from `dist/session.d.ts`
// ============================================================================

/** A conversation with the runtime, upstream a class with resume, fork and sharing on top. */
export interface CopilotSession {
    readonly sessionId: string;
    /**
     * Registers a handler for one type of event and returns the function that removes it again.
     */
    on<K extends CopilotSessionEventType>(eventType: K, handler: (event: CopilotSessionEvents[K]) => void): () => void;
    /** Sends a turn and resolves with the id of the message it created. */
    send(options: { prompt: string }): Promise<string>;
    /** Stops the turn in flight. */
    abort(): Promise<void>;
    /** Releases the session in memory, leaving what it persisted in place. */
    disconnect(): Promise<void>;
}

// ============================================================================
// Client, from `dist/client.d.ts` and `dist/types.d.ts`
// ============================================================================

/** How the SDK reaches the runtime. This integration always spawns the CLI it located. */
export interface StdioRuntimeConnection {
    readonly kind: 'stdio';
    readonly path?: string;
    readonly args?: readonly string[];
    readonly env?: Record<string, string>;
}

export type RuntimeConnection = StdioRuntimeConnection;

/** The `RuntimeConnection` value of the SDK, of which only the stdio factory is used. */
export interface RuntimeConnectionFactory {
    readonly forStdio: (options?: { path?: string, args?: readonly string[], env?: Record<string, string> }) => StdioRuntimeConnection;
}

/**
 * Selects the defaults of the runtime: `copilot-cli` brings the ambient behaviour of the CLI along,
 * `empty` requires the application to opt into what it needs.
 */
export type CopilotClientMode = 'empty' | 'copilot-cli';

/** The client options this integration sets. */
export interface CopilotClientOptions {
    connection?: RuntimeConnection;
    mode?: CopilotClientMode;
    /** Copilot home of the runtime, which becomes its `COPILOT_HOME`. Required in `empty` mode. */
    baseDirectory?: string;
    logLevel?: 'none' | 'error' | 'warning' | 'info' | 'debug' | 'all';
    env?: Record<string, string | undefined>;
    gitHubToken?: string;
    /** When false, only an explicit token is used and no sign-in found on the host. */
    useLoggedInUser?: boolean;
}

/** The session configuration this integration passes. */
export interface SessionConfig {
    model?: string;
    streaming?: boolean;
    tools?: Tool[];
    systemMessage?: SystemMessageConfig;
    /**
     * The tools to enable, as source-qualified patterns such as `custom:*` or `builtin:<name>`.
     * Required in `empty` mode.
     */
    availableTools?: string[];
    onPermissionRequest?: PermissionHandler;
}

/** The runtime as seen by this integration, upstream a class with the full session and status API. */
export interface CopilotClient {
    /** Starts the runtime and connects to it. */
    start(): Promise<void>;
    /** Stops the runtime and resolves with the errors its cleanup ran into, if any. */
    stop(): Promise<Error[]>;
    listModels(): Promise<ModelInfo[]>;
    createSession(config: SessionConfig): Promise<CopilotSession>;
    /** Removes a session and what it persisted in the Copilot home. */
    deleteSession(sessionId: string): Promise<void>;
}

export type CopilotClientConstructor = new (options?: CopilotClientOptions) => CopilotClient;
