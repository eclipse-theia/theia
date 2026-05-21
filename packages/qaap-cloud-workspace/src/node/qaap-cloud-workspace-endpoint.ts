// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { json } from 'body-parser';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import {
    QAAP_CLOUD_API_PATH,
    type QaapCloudWorkspaceEnsureRequest,
    type QaapDeployEnvVar,
    type QaapDeployRunRequest,
    type QaapPreviewShareCreateRequest,
    type QaapPushNotifyRequest,
    type QaapPushSubscribeRequest,
    type QaapTerminalSessionsUpsertRequest,
} from '../common/qaap-cloud-api-types';
import { QaapCloudOrchestrator } from './qaap-cloud-orchestrator';
import { QaapCloudWorkspaceStore } from './qaap-cloud-workspace-store';
import { QaapDeployRunner } from './qaap-deploy-runner';
import { QaapPreviewShareStore } from './qaap-preview-share-store';
import { QaapPushSubscriptionStore } from './qaap-push-subscription-store';
import { QaapTerminalSessionStore } from './qaap-terminal-session-store';
import { QaapPreviewShareProxyContribution } from './qaap-preview-share-proxy';
import { QaapWebPushService } from './qaap-web-push-service';
import { normalizeQaapPublicUrl } from '@theia/qaap-mobile-shell/lib/node/qaap-github-oauth-config';

@injectable()
export class QaapCloudWorkspaceEndpoint implements BackendApplicationContribution {

    @inject(QaapCloudWorkspaceStore)
    protected readonly workspaces: QaapCloudWorkspaceStore;

    @inject(QaapCloudOrchestrator)
    protected readonly orchestrator: QaapCloudOrchestrator;

    @inject(QaapDeployRunner)
    protected readonly deployRunner: QaapDeployRunner;

    @inject(QaapPushSubscriptionStore)
    protected readonly pushSubscriptions: QaapPushSubscriptionStore;

    @inject(QaapWebPushService)
    protected readonly webPush: QaapWebPushService;

    @inject(QaapPreviewShareStore)
    protected readonly shares: QaapPreviewShareStore;

    @inject(QaapTerminalSessionStore)
    protected readonly terminals: QaapTerminalSessionStore;

    @inject(QaapPreviewShareProxyContribution)
    protected readonly shareProxy: QaapPreviewShareProxyContribution;

    configure(app: Application): void {
        app.use(json());
        app.get(`${QAAP_CLOUD_API_PATH}/workspaces`, (req, res) => { void this.handleListWorkspaces(req, res); });
        app.post(`${QAAP_CLOUD_API_PATH}/workspaces/ensure`, (req, res) => { void this.handleEnsureWorkspace(req, res); });
        app.post(`${QAAP_CLOUD_API_PATH}/preview/share`, (req, res) => { void this.handleCreateShare(req, res); });
        app.get(`${QAAP_CLOUD_API_PATH}/terminal-sessions`, (req, res) => { void this.handleGetTerminalSessions(req, res); });
        app.post(`${QAAP_CLOUD_API_PATH}/terminal-sessions`, (req, res) => { void this.handleUpsertTerminalSessions(req, res); });
        app.get(`${QAAP_CLOUD_API_PATH}/deploy/env`, (req, res) => { void this.handleGetDeployEnv(req, res); });
        app.post(`${QAAP_CLOUD_API_PATH}/deploy/env`, (req, res) => { void this.handleSetDeployEnv(req, res); });
        app.post(`${QAAP_CLOUD_API_PATH}/deploy/run`, (req, res) => { void this.handleDeployRun(req, res); });
        app.get(`${QAAP_CLOUD_API_PATH}/push/vapid`, (req, res) => { void this.handlePushVapid(req, res); });
        app.post(`${QAAP_CLOUD_API_PATH}/push/subscribe`, (req, res) => { void this.handlePushSubscribe(req, res); });
        app.post(`${QAAP_CLOUD_API_PATH}/push/notify`, (req, res) => { void this.handlePushNotify(req, res); });
        this.shareProxy.configure(app);
    }

    protected async handleListWorkspaces(_req: Request, res: Response): Promise<void> {
        res.json({ workspaces: await this.workspaces.list() });
    }

    protected async handleEnsureWorkspace(req: Request, res: Response): Promise<void> {
        const body = (req.body ?? {}) as Partial<QaapCloudWorkspaceEnsureRequest>;
        if (!body.repoKey || typeof body.repoKey !== 'string') {
            res.status(400).json({ error: 'repoKey is required' });
            return;
        }
        const workspace = await this.orchestrator.ensure({
            repoKey: body.repoKey,
            workspaceUri: body.workspaceUri,
            githubFullName: body.githubFullName,
        });
        res.json({ workspace });
    }

    protected async handleDeployRun(req: Request, res: Response): Promise<void> {
        const body = (req.body ?? {}) as Partial<QaapDeployRunRequest>;
        if (!body.provider || !body.workspaceKey || !body.workspaceRoot) {
            res.status(400).json({ error: 'provider, workspaceKey, and workspaceRoot are required' });
            return;
        }
        const result = await this.deployRunner.run({
            provider: body.provider,
            workspaceKey: body.workspaceKey,
            workspaceRoot: body.workspaceRoot,
            projectName: body.projectName,
        });
        res.json(result);
    }

    protected async handlePushVapid(_req: Request, res: Response): Promise<void> {
        res.json({
            publicKey: this.webPush.getPublicKey(),
            enabled: this.webPush.isConfigured(),
        });
    }

    protected async handlePushSubscribe(req: Request, res: Response): Promise<void> {
        const body = (req.body ?? {}) as Partial<QaapPushSubscribeRequest>;
        const login = body.userLogin?.trim() || 'anonymous';
        if (!body.subscription?.endpoint || !body.subscription.keys?.p256dh || !body.subscription.keys.auth) {
            res.status(400).json({ error: 'subscription is required' });
            return;
        }
        await this.pushSubscriptions.upsert(login, body.subscription);
        res.json({ ok: true });
    }

    protected async handlePushNotify(req: Request, res: Response): Promise<void> {
        const body = (req.body ?? {}) as Partial<QaapPushNotifyRequest>;
        if (!body.title || !body.body) {
            res.status(400).json({ error: 'title and body are required' });
            return;
        }
        const stats = await this.webPush.notify({
            title: body.title,
            body: body.body,
            tag: body.tag,
            userLogin: body.userLogin,
        });
        res.json(stats);
    }

    protected async handleCreateShare(req: Request, res: Response): Promise<void> {
        const body = (req.body ?? {}) as Partial<QaapPreviewShareCreateRequest>;
        const port = typeof body.port === 'number' ? body.port : Number(body.port);
        if (!Number.isInteger(port) || port < 1024) {
            res.status(400).json({ error: 'port is required' });
            return;
        }
        const origin = this.resolvePublicOrigin(req);
        const summary = await this.shares.create(port, body.repoKey, origin);
        if (body.repoKey) {
            await this.workspaces.updatePreviewPort(body.repoKey, port);
        }
        res.json({ share: summary });
    }

    protected async handleGetTerminalSessions(req: Request, res: Response): Promise<void> {
        const workspaceKey = typeof req.query.workspaceKey === 'string' ? req.query.workspaceKey : '';
        if (!workspaceKey) {
            res.status(400).json({ error: 'workspaceKey is required' });
            return;
        }
        res.json({ workspaceKey, terminals: await this.terminals.get(workspaceKey) });
    }

    protected async handleUpsertTerminalSessions(req: Request, res: Response): Promise<void> {
        const body = (req.body ?? {}) as Partial<QaapTerminalSessionsUpsertRequest>;
        if (!body.workspaceKey || !Array.isArray(body.terminals)) {
            res.status(400).json({ error: 'workspaceKey and terminals are required' });
            return;
        }
        await this.terminals.upsert({
            workspaceKey: body.workspaceKey,
            terminals: body.terminals,
        });
        res.json({ ok: true });
    }

    protected async handleGetDeployEnv(req: Request, res: Response): Promise<void> {
        const workspaceKey = typeof req.query.workspaceKey === 'string' ? req.query.workspaceKey : 'default';
        res.json({ vars: await this.readDeployEnv(workspaceKey) });
    }

    protected async handleSetDeployEnv(req: Request, res: Response): Promise<void> {
        const workspaceKey = typeof req.body?.workspaceKey === 'string' ? req.body.workspaceKey : 'default';
        const vars = Array.isArray(req.body?.vars) ? req.body.vars as QaapDeployEnvVar[] : [];
        await this.writeDeployEnv(workspaceKey, vars.filter(v => v.key?.trim()));
        res.json({ vars: await this.readDeployEnv(workspaceKey) });
    }

    protected deployEnvPath(workspaceKey: string): string {
        const safe = workspaceKey.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 80);
        return `${process.env.HOME ?? ''}/.qaap/deploy-env/${safe}.json`;
    }

    protected async readDeployEnv(workspaceKey: string): Promise<QaapDeployEnvVar[]> {
        try {
            const fs = await import('fs/promises');
            const raw = await fs.readFile(this.deployEnvPath(workspaceKey), 'utf8');
            const parsed = JSON.parse(raw) as { vars?: QaapDeployEnvVar[] };
            return Array.isArray(parsed.vars) ? parsed.vars : [];
        } catch {
            return [];
        }
    }

    protected async writeDeployEnv(workspaceKey: string, vars: QaapDeployEnvVar[]): Promise<void> {
        const fs = await import('fs/promises');
        const path = await import('path');
        const file = this.deployEnvPath(workspaceKey);
        await fs.mkdir(path.dirname(file), { recursive: true });
        await fs.writeFile(file, JSON.stringify({ vars }, undefined, 2), 'utf8');
    }

    protected resolvePublicOrigin(req: Request): string {
        const envUrl = process.env.QAAP_OAUTH_PUBLIC_URL?.trim();
        if (envUrl) {
            return normalizeQaapPublicUrl(envUrl);
        }
        const proto = this.firstHeader(req.headers['x-forwarded-proto']) ?? req.protocol ?? 'http';
        const host = this.firstHeader(req.headers['x-forwarded-host']) ?? req.get('host') ?? 'localhost';
        return normalizeQaapPublicUrl(`${proto}://${host}`);
    }

    protected firstHeader(value: string | string[] | undefined): string | undefined {
        if (Array.isArray(value)) {
            return value[0]?.split(',')[0]?.trim();
        }
        return value?.split(',')[0]?.trim();
    }
}
