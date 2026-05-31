// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import {
    QAAP_PARALLEL_RUN_API_PATH,
    type QaapChooseParallelVariantRequest,
    type QaapCreateParallelRunRequest,
} from '../common/qaap-parallel-run';
import { QaapParallelRunStore } from './qaap-parallel-run-store';

/** HTTP surface for parallel agent runs (variants in isolated git worktrees). */
@injectable()
export class QaapParallelRunEndpoint implements BackendApplicationContribution {

    @inject(QaapParallelRunStore)
    protected readonly store: QaapParallelRunStore;

    configure(app: Application): void {
        app.post(QAAP_PARALLEL_RUN_API_PATH, (req, res) => {
            void this.handleCreate(req, res);
        });
        app.get(`${QAAP_PARALLEL_RUN_API_PATH}/:id`, (req, res) => {
            void this.handleGet(req, res);
        });
        app.post(`${QAAP_PARALLEL_RUN_API_PATH}/:id/choose`, (req, res) => {
            void this.handleChoose(req, res);
        });
        app.delete(`${QAAP_PARALLEL_RUN_API_PATH}/:id`, (req, res) => {
            void this.handleDelete(req, res);
        });
    }

    protected async handleCreate(req: Request, res: Response): Promise<void> {
        const body = (req.body ?? {}) as Partial<QaapCreateParallelRunRequest>;
        if (typeof body.cwd !== 'string' || typeof body.prompt !== 'string' || !Array.isArray(body.agents)) {
            res.status(400).json({ error: '"cwd", "prompt" and "agents" are required.' });
            return;
        }
        try {
            const run = await this.store.create({ cwd: body.cwd, prompt: body.prompt, agents: body.agents });
            res.status(201).json(run);
        } catch (error) {
            res.status(400).json({ error: this.errorMessage(error) });
        }
    }

    protected async handleGet(req: Request, res: Response): Promise<void> {
        try {
            const run = await this.store.get(req.params.id);
            if (!run) {
                res.status(404).json({ error: 'Parallel run not found.' });
                return;
            }
            res.json(run);
        } catch (error) {
            res.status(500).json({ error: this.errorMessage(error) });
        }
    }

    protected async handleChoose(req: Request, res: Response): Promise<void> {
        const body = (req.body ?? {}) as Partial<QaapChooseParallelVariantRequest>;
        if (typeof body.conversationId !== 'string' || typeof body.action !== 'string') {
            res.status(400).json({ error: '"conversationId" and "action" are required.' });
            return;
        }
        try {
            const result = await this.store.choose(req.params.id, body.conversationId, body.action);
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: this.errorMessage(error) });
        }
    }

    protected async handleDelete(req: Request, res: Response): Promise<void> {
        try {
            await this.store.remove(req.params.id);
            res.json({ ok: true });
        } catch (error) {
            res.status(500).json({ error: this.errorMessage(error) });
        }
    }

    protected errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
