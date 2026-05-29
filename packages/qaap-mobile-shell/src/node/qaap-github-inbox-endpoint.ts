// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { createHmac, timingSafeEqual } from 'crypto';
import {
    QAAP_GITHUB_API_PATH,
    type QaapGithubPullRequestSummary,
} from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import { fetchGithubPullRequestFiles } from './qaap-github-api';
import { QaapGithubInboxHub } from './qaap-github-inbox-hub';
import { QaapGithubSessionStore } from './qaap-github-session-store';

const SSE_HEARTBEAT_MS = 25_000;

interface GithubWebhookPullRequest {
    number: number;
    title: string;
    html_url: string;
    updated_at: string;
    state: string;
    user?: { login?: string | null } | null;
    head: { ref: string };
    base: { ref: string };
    changed_files?: number;
    additions?: number;
    deletions?: number;
    mergeable?: boolean | null;
}

interface GithubWebhookBody {
    action?: string;
    pull_request?: GithubWebhookPullRequest;
    repository?: {
        owner?: { login?: string };
        name?: string;
    };
}

/** GitHub webhooks + SSE inbox stream for the Work Hub (lives in mobile-shell so browser apps always load it). */
@injectable()
export class QaapGithubInboxEndpoint implements BackendApplicationContribution {

    @inject(QaapGithubInboxHub)
    protected readonly hub: QaapGithubInboxHub;

    @inject(QaapGithubSessionStore)
    protected readonly sessions: QaapGithubSessionStore;

    configure(app: Application): void {
        app.post(`${QAAP_GITHUB_API_PATH}/webhook`, (req, res) => {
            void this.handleWebhook(req, res);
        });
        app.get(`${QAAP_GITHUB_API_PATH}/inbox/stream`, (req, res) => {
            this.handleInboxStream(req, res);
        });
    }

    protected async handleWebhook(req: Request, res: Response): Promise<void> {
        const secret = process.env.QAAP_GITHUB_WEBHOOK_SECRET?.trim();
        if (secret && !this.verifyWebhookSignature(req, secret)) {
            res.status(401).json({ error: 'Invalid webhook signature.' });
            return;
        }
        const body = (req.body ?? {}) as GithubWebhookBody;
        if (!body.pull_request || !body.repository?.owner?.login || !body.repository.name) {
            res.status(202).json({ ok: true, ignored: true });
            return;
        }
        const action = body.action ?? 'unknown';
        const owner = body.repository.owner.login;
        const repo = body.repository.name;
        const pull = body.pull_request;
        const stored = this.sessions.getAnySession();
        let filesPreview: QaapGithubPullRequestSummary['filesPreview'] = [];
        if (stored && pull.state === 'open') {
            try {
                filesPreview = await fetchGithubPullRequestFiles(stored.accessToken, owner, repo, pull.number);
            } catch {
                filesPreview = [];
            }
        }
        const summary: QaapGithubPullRequestSummary = {
            owner,
            repo,
            number: pull.number,
            title: pull.title,
            branch: pull.head.ref,
            base: pull.base.ref,
            author: pull.user?.login || 'unknown',
            files: pull.changed_files ?? 0,
            adds: pull.additions ?? 0,
            dels: pull.deletions ?? 0,
            tests: 'unknown',
            htmlUrl: pull.html_url,
            mergeable: pull.mergeable ?? undefined,
            filesPreview,
            updatedAt: pull.updated_at,
        };
        this.hub.publishPullRequest(action, summary, 0);
        res.status(202).json({ ok: true });
    }

    protected verifyWebhookSignature(req: Request, secret: string): boolean {
        const signature = req.header('x-hub-signature-256');
        if (!signature?.startsWith('sha256=')) {
            return false;
        }
        const payload = typeof req.body === 'string'
            ? req.body
            : JSON.stringify(req.body ?? {});
        const expected = `sha256=${createHmac('sha256', secret).update(payload).digest('hex')}`;
        try {
            return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
        } catch {
            return false;
        }
    }

    protected handleInboxStream(req: Request, res: Response): void {
        res.status(200).set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        });
        res.flushHeaders?.();
        res.write(': qaap-github-inbox stream\n\n');

        const subscription = this.hub.onDidChange(event => {
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
