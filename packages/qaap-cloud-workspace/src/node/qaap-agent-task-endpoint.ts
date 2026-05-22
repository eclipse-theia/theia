// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import {
    QAAP_AGENT_TASK_API_PATH,
    type QaapAgentTaskListResponse,
    type QaapCreateAgentTaskRequest,
} from '../common/qaap-agent-task';
import { QaapAgentTaskRunner } from './qaap-agent-task-runner';

/** HTTP surface for the background agent-task runner. */
@injectable()
export class QaapAgentTaskEndpoint implements BackendApplicationContribution {

    @inject(QaapAgentTaskRunner)
    protected readonly runner: QaapAgentTaskRunner;

    configure(app: Application): void {
        app.get(QAAP_AGENT_TASK_API_PATH, (_req, res) => {
            res.json({ tasks: this.runner.list() } satisfies QaapAgentTaskListResponse);
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

    protected handleCreate(req: Request, res: Response): void {
        const body = (req.body ?? {}) as Partial<QaapCreateAgentTaskRequest>;
        if (typeof body.cwd !== 'string' || (typeof body.command !== 'string' && typeof body.prompt !== 'string')) {
            res.status(400).json({ error: '"cwd" and one of "command" or "prompt" are required.' });
            return;
        }
        try {
            const task = this.runner.create({
                command: body.command,
                prompt: body.prompt,
                cwd: body.cwd,
                title: body.title,
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
}
