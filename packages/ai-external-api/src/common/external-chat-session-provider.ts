// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import { ChatSessionStatus } from '@theia/ai-chat/lib/common/chat-model';
import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { RestBodySchema } from '@theia/external-api/lib/common/rest-body-schema';

/** Base path of the external AI session HTTP API. */
export const AI_SESSIONS_API_PATH = '/api/ai/sessions';

/** RPC path on which each frontend registers its {@link ExternalChatSessionProvider} with the backend. */
export const EXTERNAL_CHAT_SESSION_PROVIDER_PATH = '/services/ai-external-api/session-provider';

/**
 * Chat session summary as exposed by the external session list endpoint.
 */
export interface ExternalChatSessionSummary {
    id: string;
    title?: string;
    status: ChatSessionStatus;
    /** Timestamp in milliseconds since epoch of the last interaction with the session. */
    lastInteraction?: number;
    /** URI of the workspace the session belongs to, or `undefined` if its frontend has no open workspace. */
    workspace?: string;
    /** The last few lines of the conversation as plain text, or `undefined` for an empty conversation. */
    preview?: string;
    /** ID of the agent driving the session, or `undefined` if no agent is pinned to the session. */
    agentId?: string;
    /** Human-readable name of the agent driving the session, or `undefined` if no agent is pinned or the agent is not registered. */
    agentName?: string;
    /**
     * Whether the session is restored (live) in a connected frontend. Sessions that are only
     * persisted report metadata only: their status is reduced to `idle` or `failed` and they
     * carry neither a preview nor messages until they are restored.
     */
    restored: boolean;
}

export namespace ExternalChatSessionSummary {
    /** JSON Schema of {@link ExternalChatSessionSummary}, published in the OpenAPI document. */
    export const SCHEMA: IJSONSchema = {
        type: 'object',
        required: ['id', 'status', 'restored'],
        properties: {
            id: { type: 'string', description: 'Unique session id.' },
            title: { type: 'string', description: 'Session title, if one has been set or generated.' },
            status: {
                type: 'string',
                enum: [...ChatSessionStatus.VALUES],
                description: 'Aggregated session status, derived from the state of the last request. '
                    + "'awaitingApproval' and 'awaitingInput' mean the session is blocked on the user."
            },
            lastInteraction: { type: 'number', description: 'Timestamp in milliseconds since epoch of the last interaction with the session.' },
            workspace: { type: 'string', description: "URI of the workspace the session belongs to; absent when the session's frontend has no open workspace." },
            preview: {
                type: 'string',
                description: 'The last few lines of the conversation as plain text; absent for an empty conversation and for sessions that are not restored.'
            },
            agentId: { type: 'string', description: 'ID of the agent driving the session; absent when no agent is pinned to the session.' },
            agentName: { type: 'string', description: 'Human-readable name of the agent driving the session.' },
            restored: {
                type: 'boolean',
                description: 'Whether the session is restored in a connected frontend. Sessions that are not restored report persisted metadata only.'
            }
        }
    };
}

/**
 * A single entry of the simplified conversation exposed by the external session detail endpoint.
 *
 * The conversation is reduced to plain text, similar to the message history sent to the language
 * model for the next request: tool calls, thinking, and errors are rendered as text, while
 * internal details such as content ids, branches, or serialization metadata are not exposed.
 */
export interface ExternalChatMessage {
    /** Author of the entry. */
    actor: 'user' | 'ai';
    /** Plain-text representation of the entry. */
    text: string;
}

export namespace ExternalChatMessage {
    /** JSON Schema of {@link ExternalChatMessage}, published in the OpenAPI document. */
    export const SCHEMA: IJSONSchema = {
        type: 'object',
        required: ['actor', 'text'],
        properties: {
            actor: { type: 'string', enum: ['user', 'ai'], description: 'Author of the entry.' },
            text: { type: 'string', description: 'Plain-text representation of the entry.' }
        }
    };
}

/**
 * Chat session detail as exposed by the external session detail endpoint.
 */
export interface ExternalChatSessionDetail extends ExternalChatSessionSummary {
    /**
     * The session's conversation reduced to plain-text messages, oldest first.
     * Absent when the session is not restored (see {@link ExternalChatSessionSummary.restored}).
     */
    messages?: ExternalChatMessage[];
}

export namespace ExternalChatSessionDetail {
    /** JSON Schema of {@link ExternalChatSessionDetail}, published in the OpenAPI document. */
    export const SCHEMA: IJSONSchema = {
        ...ExternalChatSessionSummary.SCHEMA,
        properties: {
            ...ExternalChatSessionSummary.SCHEMA.properties,
            messages: {
                type: 'array',
                items: ExternalChatMessage.SCHEMA,
                description: "The session's conversation reduced to plain-text messages, oldest first. Absent when the session is not restored."
            }
        }
    };
}

/**
 * Prompt sent to an existing session through the external API.
 */
export interface ExternalChatPrompt {
    /** The prompt text, including optional `@agent` mentions and variable references. */
    text: string;
    /**
     * Cancel an in-progress request (including pending tool calls) before sending.
     * Without this flag, prompting a session whose status is in progress is rejected as busy.
     */
    interrupt?: boolean;
}

export namespace ExternalChatPrompt {
    /** JSON Schema of {@link ExternalChatPrompt}; bodies of the prompt endpoint are validated against it. */
    export const SCHEMA: RestBodySchema<ExternalChatPrompt> = {
        type: 'object',
        required: ['text'],
        additionalProperties: false,
        properties: {
            text: {
                type: 'string',
                pattern: '\\S',
                description: 'The prompt text, including optional `@agent` mentions and variable references. Must not be blank.'
            },
            interrupt: {
                type: 'boolean',
                description: 'Cancel an in-progress request (including pending tool calls) before sending. '
                    + 'Without this flag, prompting a session whose status is in progress is rejected as busy.'
            }
        }
    };
}

/**
 * Result of sending a prompt: the created request, or the reason the prompt was rejected.
 *
 * `busy` means a request was in progress and `interrupt` was not set; `noAgent` means no
 * agent was available to handle the prompt (none mentioned, none pinned, no default configured).
 */
export type ExternalChatPromptResult =
    | { sent: { sessionId: string; requestId: string } }
    | { failure: 'busy' | 'noAgent' };

/**
 * Session creation request as accepted by the external session creation endpoint.
 */
export interface ExternalChatSessionCreateRequest {
    /**
     * URI of the workspace in which to create the session. The session is created in a
     * frontend that has this workspace open. May be omitted when only one frontend is connected.
     */
    workspace?: string;
    /** ID of the agent to pin to the session. When omitted, the default agent handles prompts. */
    agentId?: string;
    /** Initial prompt to send right after creation. */
    prompt?: string;
    /**
     * Raise the chat view in the IDE. Note that the created session becomes the active
     * session of its frontend in any case.
     */
    focus?: boolean;
}

export namespace ExternalChatSessionCreateRequest {
    /** JSON Schema of {@link ExternalChatSessionCreateRequest}; bodies of the creation endpoint are validated against it. */
    export const SCHEMA: RestBodySchema<ExternalChatSessionCreateRequest> = {
        type: 'object',
        additionalProperties: false,
        properties: {
            workspace: {
                type: 'string',
                pattern: '\\S',
                description: 'URI of the workspace in which to create the session. The session is created in a frontend that has this workspace open. '
                    + 'May be omitted when all connected frontends share the same workspace.'
            },
            agentId: {
                type: 'string',
                pattern: '\\S',
                description: 'ID of the agent to pin to the session. When omitted, the default agent handles prompts.'
            },
            prompt: {
                type: 'string',
                pattern: '\\S',
                description: 'Initial prompt to send right after creation. Must not be blank when given.'
            },
            focus: {
                type: 'boolean',
                description: 'Raise the chat view in the IDE. The created session becomes the active session of its frontend in any case.'
            }
        }
    };
}

/**
 * Result of a session creation: the created session, or the reason creation was rejected.
 *
 * `unknownAgent` means the requested agent id is not registered; `noAgent` means the initial
 * prompt could not be handled because no agent was available (the session is not kept in that
 * case); `workspaceNotFound` means no connected frontend matches the requested workspace;
 * `ambiguousWorkspace` means no workspace was given and the connected frontends have
 * different workspaces open.
 */
export type ExternalChatSessionCreateResult =
    | { created: { session: ExternalChatSessionSummary; requestId?: string } }
    | { failure: 'unknownAgent' | 'noAgent' | 'workspaceNotFound' | 'ambiguousWorkspace' };

export const ExternalChatSessionProvider = Symbol('ExternalChatSessionProvider');
/**
 * Provides chat session information and session actions for the external API.
 *
 * Implemented by each frontend and registered with the backend over RPC. The backend
 * queries the registered providers on demand when external clients call the HTTP API.
 */
export interface ExternalChatSessionProvider {
    /** Returns the URI of the workspace this frontend has opened, or `undefined` if none. */
    getWorkspace(): Promise<string | undefined>;
    /**
     * Returns summaries of all sessions known to this frontend: sessions restored in memory
     * as well as persisted sessions that have not been restored (reported with their
     * persisted metadata and `restored: false`).
     */
    getSessions(): Promise<ExternalChatSessionSummary[]>;
    /**
     * Returns the detail of the given session, or `undefined` if the session is unknown to this
     * frontend. For persisted sessions that are not restored, the detail carries no messages.
     */
    getSession(sessionId: string): Promise<ExternalChatSessionDetail | undefined>;
    /**
     * Restores the given session if necessary and shows it in this frontend's chat view.
     * Returns `false` if the session is unknown to this frontend.
     */
    openSession(sessionId: string): Promise<boolean>;
    /**
     * Restores the given session in this frontend without focusing it. Returns the detail of
     * the restored session, or `undefined` if the session is unknown to this frontend.
     */
    restoreSession(sessionId: string): Promise<ExternalChatSessionDetail | undefined>;
    /**
     * Sends a prompt to the given session, restoring it first if necessary. Returns `undefined`
     * if the session is unknown to this frontend.
     */
    sendPrompt(sessionId: string, prompt: ExternalChatPrompt): Promise<ExternalChatPromptResult | undefined>;
    /**
     * Creates a new session in this frontend and sends the initial prompt, if one is given.
     * The created session becomes the frontend's active session. The request's `workspace` is
     * ignored; routing to a matching frontend is the backend's responsibility.
     */
    createSession(request: ExternalChatSessionCreateRequest): Promise<ExternalChatSessionCreateResult>;
}

export const ExternalChatSessionBackendService = Symbol('ExternalChatSessionBackendService');
/**
 * Backend side of the {@link ExternalChatSessionProvider} connection.
 *
 * Invoked by each frontend to inform the backend about session changes so that the backend
 * can push updates to external event stream clients.
 */
export interface ExternalChatSessionBackendService {
    /**
     * Notifies the backend that the sessions of the calling frontend changed in a way visible
     * to the external API (session created/deleted/renamed or session status changed).
     */
    notifySessionsChanged(): void;
}
