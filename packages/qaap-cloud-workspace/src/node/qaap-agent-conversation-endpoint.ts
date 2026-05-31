// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import {
    QAAP_AGENT_CONVERSATION_API_PATH,
    QaapAgentConversationAllResponse,
    QaapAgentConversationListResponse,
    QaapCreateAgentConversationRequest,
    QaapPostAgentMessageRequest,
    QaapUpdateAgentConversationRequest,
} from '../common/qaap-agent-conversation';
import { QaapAgentConversationStore } from './qaap-agent-conversation-store';

const SSE_HEARTBEAT_MS = 25_000;

/** HTTP surface for the persistent agent-conversation store. */
@injectable()
export class QaapAgentConversationEndpoint implements BackendApplicationContribution {

    @inject(QaapAgentConversationStore)
    protected readonly store: QaapAgentConversationStore;

    configure(app: Application): void {
        // List for one cwd (or all).
        app.get(QAAP_AGENT_CONVERSATION_API_PATH, (req, res) => {
            const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
            res.json({ conversations: this.store.list(cwd) } satisfies QaapAgentConversationListResponse);
        });
        // Cross-project dashboard feed — static segments before the `:id` handler.
        app.get(`${QAAP_AGENT_CONVERSATION_API_PATH}/all`, (_req, res) => {
            res.json({ groups: this.store.listAllGroupedByCwd() } satisfies QaapAgentConversationAllResponse);
        });
        app.get(`${QAAP_AGENT_CONVERSATION_API_PATH}/stream`, (req, res) => {
            this.handleStream(req, res);
        });
        app.post(QAAP_AGENT_CONVERSATION_API_PATH, (req, res) => {
            this.handleCreate(req, res);
        });
        app.get(`${QAAP_AGENT_CONVERSATION_API_PATH}/:id`, (req, res) => {
            const conv = this.store.get(req.params.id);
            if (!conv) {
                res.status(404).json({ error: 'Conversation not found.' });
                return;
            }
            res.json(conv);
        });
        app.post(`${QAAP_AGENT_CONVERSATION_API_PATH}/:id/messages`, (req, res) => {
            this.handlePostMessage(req, res);
        });
        app.patch(`${QAAP_AGENT_CONVERSATION_API_PATH}/:id`, (req, res) => {
            this.handleUpdate(req, res);
        });
        app.post(`${QAAP_AGENT_CONVERSATION_API_PATH}/:id/fork`, (req, res) => {
            const conv = this.store.fork(req.params.id);
            if (!conv) {
                res.status(404).json({ error: 'Conversation not found.' });
                return;
            }
            res.status(201).json(conv);
        });
        app.post(`${QAAP_AGENT_CONVERSATION_API_PATH}/:id/cancel`, (req, res) => {
            const conv = this.store.cancel(req.params.id);
            if (!conv) {
                res.status(404).json({ error: 'Conversation not found.' });
                return;
            }
            res.json(conv);
        });
        app.post(`${QAAP_AGENT_CONVERSATION_API_PATH}/:id/retry`, (req, res) => {
            try {
                const conv = this.store.retry(req.params.id);
                res.json(conv);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const status = message.includes('not found') ? 404 : 400;
                res.status(status).json({ error: message });
            }
        });
        app.post(`${QAAP_AGENT_CONVERSATION_API_PATH}/:id/checkpoints/:checkpointId/restore`, (req, res) => {
            void (async () => {
                try {
                    const conv = await this.store.restoreCheckpoint(req.params.id, req.params.checkpointId);
                    if (!conv) {
                        res.status(404).json({ error: 'Conversation not found.' });
                        return;
                    }
                    res.json(conv);
                } catch (error) {
                    res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
                }
            })();
        });
        app.delete(`${QAAP_AGENT_CONVERSATION_API_PATH}/:id`, (req, res) => {
            const ok = this.store.delete(req.params.id);
            res.status(ok ? 204 : 404).end();
        });
    }

    protected handleCreate(req: Request, res: Response): void {
        const body = (req.body ?? {}) as Partial<QaapCreateAgentConversationRequest>;
        if (typeof body.cwd !== 'string' || !body.cwd) {
            res.status(400).json({ error: '"cwd" is required.' });
            return;
        }
        try {
            const conv = this.store.create({
                cwd: body.cwd,
                agent: body.agent,
                title: body.title,
                message: body.message,
            });
            res.status(201).json(conv);
        } catch (error) {
            res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
        }
    }

    protected handlePostMessage(req: Request, res: Response): void {
        const body = (req.body ?? {}) as Partial<QaapPostAgentMessageRequest>;
        const content = typeof body.content === 'string' ? body.content.trim() : '';
        if (!content) {
            res.status(400).json({ error: '"content" must be a non-empty string.' });
            return;
        }
        const agent = typeof body.agent === 'string' ? body.agent.trim() : undefined;
        try {
            const conv = this.store.postUserMessage(req.params.id, content, agent || undefined);
            res.status(202).json(conv);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            res.status(message === 'Conversation not found.' ? 404 : 400).json({ error: message });
        }
    }

    protected handleUpdate(req: Request, res: Response): void {
        const body = (req.body ?? {}) as Partial<QaapUpdateAgentConversationRequest>;
        const patch: { -readonly [K in keyof QaapUpdateAgentConversationRequest]: QaapUpdateAgentConversationRequest[K] } = {};
        if (typeof body.title === 'string') {
            const title = body.title.trim();
            if (!title) {
                res.status(400).json({ error: '"title" must be a non-empty string.' });
                return;
            }
            patch.title = title;
        }
        if (typeof body.priority === 'boolean') {
            patch.priority = body.priority;
        }
        if (typeof body.paused === 'boolean') {
            patch.paused = body.paused;
        }
        if (typeof body.autoApprove === 'boolean') {
            patch.autoApprove = body.autoApprove;
        }
        if (Object.keys(patch).length === 0) {
            res.status(400).json({ error: 'No mutable fields supplied.' });
            return;
        }
        const conv = this.store.update(req.params.id, patch);
        if (!conv) {
            res.status(404).json({ error: 'Conversation not found.' });
            return;
        }
        res.json(conv);
    }

    /** SSE feed of conversation events used by every connected client for live updates. */
    protected handleStream(req: Request, res: Response): void {
        res.status(200).set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.flushHeaders?.();
        res.write(': qaap-agent-conversations stream\n\n');

        const subscription = this.store.onDidChange(event => {
            res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
        });
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), SSE_HEARTBEAT_MS);

        const cleanup = (): void => {
            clearInterval(heartbeat);
            subscription.dispose();
        };
        req.on('close', cleanup);
        res.on('close', cleanup);
    }
}
