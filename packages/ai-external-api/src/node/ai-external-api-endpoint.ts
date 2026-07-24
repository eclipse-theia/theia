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

import { IJSONSchema } from '@theia/core/lib/common/json-schema';
import { inject, injectable } from '@theia/core/shared/inversify';
import { ExternalApiContribution, ExternalApiContributionDocumentation } from '@theia/external-api/lib/node/external-api-contribution';
import { ExternalApiRouter, RestParamDocumentation } from '@theia/external-api/lib/node/external-api-router';
import { RestResult } from '@theia/external-api/lib/node/rest-result';
import {
    AI_SESSIONS_API_PATH, ExternalChatPrompt, ExternalChatSessionCreateRequest, ExternalChatSessionDetail, ExternalChatSessionSummary
} from '../common/external-chat-session-provider';
import { ExternalChatSessionRegistry } from './external-chat-session-registry';

const SESSION_ID_PARAM: RestParamDocumentation = { description: 'The session id.' };

const SESSION_LIST_SCHEMA: IJSONSchema = {
    type: 'object',
    required: ['sessions'],
    properties: {
        sessions: { type: 'array', items: ExternalChatSessionSummary.SCHEMA, description: 'The sessions, most recently used first.' }
    }
};

const SESSION_CREATED_SCHEMA: IJSONSchema = {
    type: 'object',
    required: ['session'],
    properties: {
        session: ExternalChatSessionSummary.SCHEMA,
        requestId: { type: 'string', description: 'Id of the request created for the initial prompt; absent when no prompt was sent.' }
    }
};

const PROMPT_ACCEPTED_SCHEMA: IJSONSchema = {
    type: 'object',
    required: ['sessionId', 'requestId'],
    properties: {
        sessionId: { type: 'string', description: 'Id of the prompted session.' },
        requestId: { type: 'string', description: 'Id of the created request.' }
    }
};

/**
 * Contributes the AI session API to the external API server:
 * - `GET /api/ai/sessions` lists all sessions (restored and persisted) with id, title, status,
 *   agent, workspace, last interaction time, and a short plain-text preview of the conversation.
 * - `POST /api/ai/sessions` creates a session in a frontend matching the requested workspace,
 *   optionally pinning an agent and sending an initial prompt.
 * - `GET /api/ai/sessions/events` streams the session list as server-sent events, pushing an
 *   updated list whenever sessions change.
 * - `GET /api/ai/sessions/:id` returns a single session including its conversation reduced to
 *   plain-text messages (persisted sessions report metadata only until restored).
 * - `POST /api/ai/sessions/:id/open` shows the session in the chat view of a connected frontend.
 * - `POST /api/ai/sessions/:id/restore` restores a persisted session and returns its detail.
 * - `POST /api/ai/sessions/:id/prompt` sends a prompt to the session.
 *
 * The endpoints are served on the external API port and are token-protected when an
 * external API token is configured (see `@theia/external-api`).
 */
@injectable()
export class AIExternalApiEndpoint implements ExternalApiContribution {

    readonly path = AI_SESSIONS_API_PATH;

    readonly documentation: ExternalApiContributionDocumentation = {
        title: 'AI Chat Sessions',
        description: 'Inspect, follow, open, prompt, and create the AI chat sessions of this Theia instance.'
    };

    @inject(ExternalChatSessionRegistry)
    protected readonly registry: ExternalChatSessionRegistry;

    configure(router: ExternalApiRouter): void {
        router.get('/', {
            operationId: 'listChatSessions',
            summary: 'List all AI chat sessions, most recently used first.',
            responses: {
                200: { description: 'The current sessions of all connected frontends.', schema: SESSION_LIST_SCHEMA }
            }
        }, async () => RestResult.ok({ sessions: await this.registry.getSessions() }));
        // register before '/:id' so that 'events' is not treated as a session id
        const events = router.eventStream('/events', {
            event: 'sessions',
            operationId: 'streamChatSessions',
            summary: 'Stream the session list as server-sent events.',
            description: 'On connect, the stream immediately delivers the current session list; afterwards, the full, '
                + 'updated list is pushed whenever sessions change. Consume each event as a replacement, not a delta.',
            dataSchema: SESSION_LIST_SCHEMA,
            snapshot: async () => ({ sessions: await this.registry.getSessions() })
        });
        router.toDispose.push(this.registry.onDidChangeSessions(() => events.notifyChanged()));
        router.get('/:id', {
            operationId: 'getChatSession',
            summary: 'Get a single session including its conversation reduced to plain-text messages.',
            params: { id: SESSION_ID_PARAM },
            responses: {
                200: {
                    description: 'The session detail. Persisted sessions that are not restored carry no messages.',
                    schema: ExternalChatSessionDetail.SCHEMA
                },
                404: { description: 'The session is unknown to all connected frontends.' }
            }
        }, async ({ params }) => {
            const session = await this.registry.getSession(params.id);
            return session ? RestResult.ok(session) : RestResult.notFound();
        });
        router.post('/', {
            operationId: 'createChatSession',
            summary: 'Create a chat session in a connected frontend and optionally send an initial prompt.',
            bodySchema: ExternalChatSessionCreateRequest.SCHEMA,
            responses: {
                201: { description: 'The created session and, if an initial prompt was sent, the id of the created request.', schema: SESSION_CREATED_SCHEMA },
                400: { description: 'The requested agent is not registered.' },
                404: { description: 'No connected frontend matches the requested workspace.' },
                409: { description: 'The workspace is ambiguous or no agent could handle the initial prompt.' }
            }
        }, ({ body }) => this.createSession(body));
        router.post('/:id/open', {
            operationId: 'openChatSession',
            summary: 'Show the session in the chat view of a connected frontend, restoring it first if necessary.',
            params: { id: SESSION_ID_PARAM },
            responses: {
                204: { description: 'The session is shown in a frontend.' },
                404: { description: 'The session is unknown to all connected frontends.' }
            }
        }, async ({ params }) =>
            await this.registry.openSession(params.id) ? RestResult.noContent() : RestResult.notFound());
        router.post('/:id/restore', {
            operationId: 'restoreChatSession',
            summary: 'Restore the session in a connected frontend without focusing it, and return its detail.',
            params: { id: SESSION_ID_PARAM },
            responses: {
                200: { description: 'The detail of the restored session.', schema: ExternalChatSessionDetail.SCHEMA },
                404: { description: 'The session is unknown to all connected frontends.' }
            }
        }, async ({ params }) => {
            const session = await this.registry.restoreSession(params.id);
            return session ? RestResult.ok(session) : RestResult.notFound();
        });
        router.post('/:id/prompt', {
            operationId: 'promptChatSession',
            summary: 'Send a prompt to the session, restoring it first if necessary.',
            bodySchema: ExternalChatPrompt.SCHEMA,
            params: { id: SESSION_ID_PARAM },
            responses: {
                202: { description: 'The prompt was submitted; follow the progress via the event stream or the read endpoints.', schema: PROMPT_ACCEPTED_SCHEMA },
                404: { description: 'The session is unknown to all connected frontends.' },
                409: { description: 'A request is in progress and `interrupt` was not set, or no agent is available.' }
            }
        }, ({ params, body }) => this.sendPrompt(params.id, body));
    }

    protected async createSession(request: ExternalChatSessionCreateRequest): Promise<RestResult> {
        const result = await this.registry.createSession(request);
        if ('created' in result) {
            return RestResult.created(result.created);
        }
        switch (result.failure) {
            case 'unknownAgent':
                return RestResult.badRequest('unknown agent');
            case 'noAgent':
                return RestResult.conflict('no agent available');
            case 'workspaceNotFound':
                return RestResult.notFound('workspace not found');
            case 'ambiguousWorkspace':
                return RestResult.conflict('ambiguous workspace');
        }
    }

    protected async sendPrompt(sessionId: string, prompt: ExternalChatPrompt): Promise<RestResult> {
        const result = await this.registry.sendPrompt(sessionId, prompt);
        if (!result) {
            return RestResult.notFound();
        }
        if ('sent' in result) {
            return RestResult.accepted(result.sent);
        }
        return RestResult.conflict(result.failure === 'busy' ? 'busy' : 'no agent available');
    }
}
