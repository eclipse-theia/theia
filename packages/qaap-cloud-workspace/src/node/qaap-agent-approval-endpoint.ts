// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { QAAP_AGENT_APPROVAL_API_PATH } from '../common/qaap-agent-approval';
import { QaapAgentApprovalStore } from './qaap-agent-approval-store';

/** HTTP surface for granular VPS agent tool / permission approvals. */
@injectable()
export class QaapAgentApprovalEndpoint implements BackendApplicationContribution {

    @inject(QaapAgentApprovalStore)
    protected readonly store: QaapAgentApprovalStore;

    configure(app: Application): void {
        app.get(QAAP_AGENT_APPROVAL_API_PATH, (req, res) => {
            void this.handleList(req, res);
        });
        app.post(`${QAAP_AGENT_APPROVAL_API_PATH}/:id/approve`, (req, res) => {
            void this.handleApprove(req, res);
        });
        app.post(`${QAAP_AGENT_APPROVAL_API_PATH}/:id/reject`, (req, res) => {
            void this.handleReject(req, res);
        });
    }

    protected async handleList(req: Request, res: Response): Promise<void> {
        try {
            const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
            const approvals = await this.store.list(cwd);
            res.json({ approvals });
        } catch (error) {
            res.status(500).json({ ok: false, error: this.errorMessage(error) });
        }
    }

    protected async handleApprove(req: Request, res: Response): Promise<void> {
        try {
            const result = await this.store.approve(req.params.id);
            res.status(result.ok ? 200 : 400).json(result);
        } catch (error) {
            res.status(500).json({ ok: false, error: this.errorMessage(error) });
        }
    }

    protected async handleReject(req: Request, res: Response): Promise<void> {
        try {
            const result = await this.store.reject(req.params.id);
            res.status(result.ok ? 200 : 400).json(result);
        } catch (error) {
            res.status(500).json({ ok: false, error: this.errorMessage(error) });
        }
    }

    protected errorMessage(error: unknown): string {
        return error instanceof Error ? error.message : String(error);
    }
}
