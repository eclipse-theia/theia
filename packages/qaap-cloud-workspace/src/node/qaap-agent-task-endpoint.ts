// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import * as http from 'http';
import * as https from 'https';
import {
    QAAP_AGENT_TASK_API_PATH,
    type QaapAgentTaskAllResponse,
    type QaapAgentTaskListResponse,
    type QaapCreateAgentTaskRequest,
} from '../common/qaap-agent-task';
import { QaapAgentTaskRunner } from './qaap-agent-task-runner';

/** Keep SSE connections warm through proxies that idle-kill silent sockets. */
const SSE_HEARTBEAT_MS = 25_000;

/** Header carrying the helper-CLI token when an agent calls back to spawn a sub-task. */
const HELPER_TOKEN_HEADER = 'x-qaap-task-token';

/** HTTP surface for the background agent-task runner. */
@injectable()
export class QaapAgentTaskEndpoint implements BackendApplicationContribution {

    @inject(QaapAgentTaskRunner)
    protected readonly runner: QaapAgentTaskRunner;

    configure(app: Application): void {
        app.get(QAAP_AGENT_TASK_API_PATH, (req, res) => {
            const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
            res.json({
                tasks: this.runner.listForCwd(cwd),
                agentConfigured: this.runner.isAgentConfigured(),
                agents: this.runner.listAgents(),
                defaultAgent: this.runner.defaultAgent(),
            } satisfies QaapAgentTaskListResponse);
        });
        // Cross-project dashboard feed — `/all` and `/stream` are static segments routed before
        // the `/:id` handler below so they never collide with a task id.
        app.get(`${QAAP_AGENT_TASK_API_PATH}/all`, (_req, res) => {
            res.json({
                groups: this.runner.listAllGroupedByCwd(),
                agentConfigured: this.runner.isAgentConfigured(),
                agents: this.runner.listAgents(),
                defaultAgent: this.runner.defaultAgent(),
            } satisfies QaapAgentTaskAllResponse);
        });
        app.get(`${QAAP_AGENT_TASK_API_PATH}/stream`, (req, res) => {
            this.handleStream(req, res);
        });
        app.post(QAAP_AGENT_TASK_API_PATH, (req, res) => {
            this.handleCreate(req, res);
        });
        app.get(`${QAAP_AGENT_TASK_API_PATH}/:id`, (req, res) => {
            void this.handleDetail(req, res);
        });
        app.post(`${QAAP_AGENT_TASK_API_PATH}/:id/cancel`, (req, res) => {
            const task = this.runner.cancel(req.params.id);
            if (!task) {
                res.status(404).json({ error: 'Task not found.' });
                return;
            }
            res.json(task);
        });
    }

    /** Capture the port the backend is listening on so spawned agents can call back via HTTP. */
    onStart(server: http.Server | https.Server): void {
        const address = server.address();
        if (address && typeof address === 'object') {
            this.runner.bindHelperApiUrl(address.port);
        }
    }

    protected handleCreate(req: Request, res: Response): void {
        const body = (req.body ?? {}) as Partial<QaapCreateAgentTaskRequest>;
        if (typeof body.cwd !== 'string' || (typeof body.command !== 'string' && typeof body.prompt !== 'string')) {
            res.status(400).json({ error: '"cwd" and one of "command" or "prompt" are required.' });
            return;
        }
        // Helper-CLI calls authenticate via the shared token header; ignore parentId from regular UI calls.
        const helperToken = req.header(HELPER_TOKEN_HEADER);
        const parentId = helperToken && this.runner.verifyHelperToken(helperToken)
            ? body.parentId
            : undefined;
        try {
            const task = this.runner.create({
                command: body.command,
                prompt: body.prompt,
                agent: body.agent,
                cwd: body.cwd,
                title: body.title,
                parentId,
            });
            res.status(201).json(task);
        } catch (error) {
            res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
        }
    }

    protected async handleDetail(req: Request, res: Response): Promise<void> {
        const detail = await this.runner.detail(req.params.id);
        if (!detail) {
            res.status(404).json({ error: 'Task not found.' });
            return;
        }
        res.json(detail);
    }

    /**
     * Server-Sent Events feed of task state changes. The cross-project dashboard subscribes here
     * to refresh card status live without polling each project.
     */
    protected handleStream(req: Request, res: Response): void {
        res.status(200).set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            // Disable proxy buffering (nginx) so events flush immediately.
            'X-Accel-Buffering': 'no',
        });
        res.flushHeaders?.();
        // Initial comment-line primes the connection on some clients.
        res.write(': qaap-agent-tasks stream\n\n');

        const subscription = this.runner.onDidChangeTask(event => {
            res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.task)}\n\n`);
        });
        const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), SSE_HEARTBEAT_MS);

        const cleanup = (): void => {
            clearInterval(heartbeat);
            subscription.dispose();
        };
        req.on('close', cleanup);
        req.on('aborted', cleanup);
        res.on('close', cleanup);
    }
}
