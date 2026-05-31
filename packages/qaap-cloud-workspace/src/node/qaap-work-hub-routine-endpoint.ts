// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import {
    QAAP_WORK_HUB_ROUTINE_API_PATH,
    type QaapCreateWorkHubRoutineBody,
    type QaapUpdateWorkHubRoutineBody,
    type QaapWorkHubRoutineListResponse,
} from '@theia/qaap-mobile-shell/lib/common/qaap-work-hub-routine';
import { QaapAgentTaskRunner } from './qaap-agent-task-runner';
import { QaapWorkHubRoutineRunner } from './qaap-work-hub-routine-runner';
import { QaapWorkHubRoutineStore } from './qaap-work-hub-routine-store';

@injectable()
export class QaapWorkHubRoutineEndpoint implements BackendApplicationContribution {

    @inject(QaapWorkHubRoutineStore)
    protected readonly store: QaapWorkHubRoutineStore;

    @inject(QaapWorkHubRoutineRunner)
    protected readonly runner: QaapWorkHubRoutineRunner;

    @inject(QaapAgentTaskRunner)
    protected readonly taskRunner: QaapAgentTaskRunner;

    configure(app: Application): void {
        app.get(QAAP_WORK_HUB_ROUTINE_API_PATH, (_req, res) => {
            res.json({
                routines: this.store.list(),
                agentConfigured: this.taskRunner.isAgentConfigured(),
                defaultAgent: this.taskRunner.defaultAgent(),
            } satisfies QaapWorkHubRoutineListResponse);
        });
        app.post(QAAP_WORK_HUB_ROUTINE_API_PATH, (req, res) => {
            this.handleCreate(req, res);
        });
        app.patch(`${QAAP_WORK_HUB_ROUTINE_API_PATH}/:id`, (req, res) => {
            this.handleUpdate(req, res);
        });
        app.delete(`${QAAP_WORK_HUB_ROUTINE_API_PATH}/:id`, (req, res) => {
            this.handleDelete(req, res);
        });
        app.post(`${QAAP_WORK_HUB_ROUTINE_API_PATH}/:id/run`, (req, res) => {
            this.handleRun(req, res);
        });
    }

    protected handleCreate(req: Request, res: Response): void {
        const body = (req.body ?? {}) as Partial<QaapCreateWorkHubRoutineBody>;
        if (typeof body.title !== 'string' || typeof body.prompt !== 'string' || typeof body.cwd !== 'string') {
            res.status(400).json({ error: '"title", "prompt", and "cwd" are required.' });
            return;
        }
        if (!body.title.trim() || !body.prompt.trim() || !body.cwd.trim()) {
            res.status(400).json({ error: 'Fields cannot be empty.' });
            return;
        }
        try {
            const routine = this.store.create({
                title: body.title,
                prompt: body.prompt,
                cwd: body.cwd,
                agent: body.agent,
                trigger: body.trigger,
                intervalHours: body.intervalHours,
                cronExpression: body.cronExpression,
                timezone: body.timezone,
                oneShot: body.oneShot,
                runMode: body.runMode,
                enabled: body.enabled,
                autoApprove: body.autoApprove,
            });
            res.status(201).json(routine);
        } catch (error) {
            res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
        }
    }

    protected handleUpdate(req: Request, res: Response): void {
        const body = (req.body ?? {}) as QaapUpdateWorkHubRoutineBody;
        const updated = this.store.update(req.params.id, body);
        if (!updated) {
            res.status(404).json({ error: 'Routine not found.' });
            return;
        }
        res.json(updated);
    }

    protected handleDelete(req: Request, res: Response): void {
        if (!this.store.delete(req.params.id)) {
            res.status(404).json({ error: 'Routine not found.' });
            return;
        }
        res.status(204).end();
    }

    protected handleRun(req: Request, res: Response): void {
        try {
            const routine = this.runner.runNow(req.params.id);
            res.json(routine);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes('not found')) {
                res.status(404).json({ error: message });
                return;
            }
            res.status(500).json({ error: message });
        }
    }
}
