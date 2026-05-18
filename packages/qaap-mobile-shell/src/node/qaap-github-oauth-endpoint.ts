// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import {
    QAAP_AUTH_API_PATH,
    QAAP_AUTH_SESSION_COOKIE,
    QAAP_GITHUB_API_PATH,
    QAAP_GITHUB_OAUTH_CALLBACK_PATH,
    QAAP_GITHUB_OAUTH_START_PATH,
} from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import { exchangeGithubCode, fetchGithubRepositories, fetchGithubUser } from './qaap-github-api';
import { readQaapGithubOAuthConfig } from './qaap-github-oauth-config';
import { QaapGithubSessionStore } from './qaap-github-session-store';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_OAUTH_SCOPE = 'read:user repo';
const THEIA_EMPTY_WINDOW_HASH = '!empty';

@injectable()
export class QaapGithubOauthEndpoint implements BackendApplicationContribution {

    @inject(QaapGithubSessionStore)
    protected readonly sessions: QaapGithubSessionStore;

    configure(app: Application): void {
        app.get(QAAP_GITHUB_OAUTH_START_PATH, (req, res) => this.handleOAuthStart(req, res));
        app.get(QAAP_GITHUB_OAUTH_CALLBACK_PATH, (req, res) => this.handleOAuthCallback(req, res));
        app.get(`${QAAP_AUTH_API_PATH}/config`, (req, res) => this.handleAuthConfig(req, res));
        app.get(`${QAAP_AUTH_API_PATH}/session`, (req, res) => this.handleAuthSession(req, res));
        app.post(`${QAAP_AUTH_API_PATH}/signout`, (req, res) => this.handleSignOut(req, res));
        app.get(`${QAAP_GITHUB_API_PATH}/repositories`, (req, res) => this.handleGithubRepositories(req, res));
    }

    protected handleOAuthStart(_req: Request, res: Response): void {
        const config = readQaapGithubOAuthConfig();
        if (!config) {
            res.status(503).send('GitHub OAuth is not configured (QAAP_GITHUB_CLIENT_ID, QAAP_GITHUB_CLIENT_SECRET, QAAP_OAUTH_PUBLIC_URL).');
            return;
        }
        const state = this.sessions.createOAuthState();
        const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL);
        authorizeUrl.searchParams.set('client_id', config.clientId);
        authorizeUrl.searchParams.set('redirect_uri', config.callbackUrl);
        authorizeUrl.searchParams.set('scope', GITHUB_OAUTH_SCOPE);
        authorizeUrl.searchParams.set('state', state);
        res.redirect(302, authorizeUrl.toString());
    }

    protected async handleOAuthCallback(req: Request, res: Response): Promise<void> {
        const config = readQaapGithubOAuthConfig();
        if (!config) {
            res.status(503).send('GitHub OAuth is not configured.');
            return;
        }
        const error = typeof req.query.error === 'string' ? req.query.error : undefined;
        if (error) {
            this.redirectAfterOAuth(res, config.publicUrl, false);
            return;
        }
        const code = typeof req.query.code === 'string' ? req.query.code : undefined;
        const state = typeof req.query.state === 'string' ? req.query.state : undefined;
        if (!code || !this.sessions.consumeOAuthState(state)) {
            this.redirectAfterOAuth(res, config.publicUrl, false);
            return;
        }
        try {
            const accessToken = await exchangeGithubCode(config, code);
            const user = await fetchGithubUser(accessToken);
            const sessionId = this.sessions.createSession({ accessToken, user });
            this.setSessionCookie(res, sessionId);
            this.redirectAfterOAuth(res, config.publicUrl, true);
        } catch {
            this.redirectAfterOAuth(res, config.publicUrl, false);
        }
    }

    protected handleAuthConfig(_req: Request, res: Response): void {
        const skipAuth = process.env.QAAP_SKIP_AUTH === 'true' || process.env.QAAP_SKIP_AUTH === '1';
        res.json({
            githubOAuth: !!readQaapGithubOAuthConfig(),
            skipAuth,
        });
    }

    protected handleAuthSession(req: Request, res: Response): void {
        const stored = this.sessions.getSession(this.readSessionId(req));
        if (!stored) {
            res.json({ signedIn: false });
            return;
        }
        const sessionId = this.readSessionId(req);
        res.json({
            signedIn: true,
            user: stored.user,
            sessionId,
        });
    }

    protected handleSignOut(req: Request, res: Response): void {
        this.sessions.deleteSession(this.readSessionId(req));
        this.clearSessionCookie(res);
        res.json({ ok: true });
    }

    protected async handleGithubRepositories(req: Request, res: Response): Promise<void> {
        const stored = this.sessions.getSession(this.readSessionId(req));
        if (!stored) {
            res.status(401).json({ error: 'Not signed in' });
            return;
        }
        try {
            const repositories = await fetchGithubRepositories(stored.accessToken);
            res.json({ repositories });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load repositories';
            res.status(502).json({ error: message });
        }
    }

    protected redirectAfterOAuth(res: Response, publicUrl: string, success: boolean): void {
        const target = new URL(publicUrl + '/');
        if (success) {
            target.searchParams.set('qaap_oauth', 'github');
        } else {
            target.searchParams.set('qaap_oauth_error', '1');
        }
        // Theia restores the most recent workspace when there is no hash. Use
        // the explicit empty-window hash to avoid reopening a stale workspace.
        res.redirect(302, `${target.toString()}#${THEIA_EMPTY_WINDOW_HASH}`);
    }

    protected readSessionId(req: Request): string | undefined {
        const header = req.headers.cookie;
        if (!header || typeof header !== 'string') {
            return undefined;
        }
        for (const part of header.split(';')) {
            const trimmed = part.trim();
            const eq = trimmed.indexOf('=');
            if (eq <= 0) {
                continue;
            }
            const name = trimmed.slice(0, eq);
            if (name === QAAP_AUTH_SESSION_COOKIE) {
                const value = trimmed.slice(eq + 1);
                return value ? decodeURIComponent(value) : undefined;
            }
        }
        return undefined;
    }

    protected setSessionCookie(res: Response, sessionId: string): void {
        const maxAge = 30 * 24 * 60 * 60;
        res.setHeader(
            'Set-Cookie',
            `${QAAP_AUTH_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`
        );
    }

    protected clearSessionCookie(res: Response): void {
        res.setHeader(
            'Set-Cookie',
            `${QAAP_AUTH_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
        );
    }
}
