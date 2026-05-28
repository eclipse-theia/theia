// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Application, Request, Response } from '@theia/core/shared/express';
import { json } from 'body-parser';
import { BackendApplicationContribution, FileUri } from '@theia/core/lib/node';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
    QAAP_AUTH_API_PATH,
    QAAP_AUTH_SESSION_COOKIE,
    QAAP_AUTH_SESSION_HEADER,
    QAAP_GITHUB_API_PATH,
    QAAP_GITHUB_OAUTH_CALLBACK_PATH,
    QAAP_GITHUB_OAUTH_START_PATH,
    type QaapGithubCreateRepositoryRequest,
    type QaapGithubMergePullRequestRequest,
    type QaapGithubOpenRepositoryRequest,
    type QaapGithubRepositorySummary,
    type QaapProjectSessionUpsertRequest,
} from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import {
    createGithubRepository,
    exchangeGithubCode,
    fetchGithubPullRequests,
    fetchGithubRepositories,
    fetchGithubRepository,
    fetchGithubUser,
    mergeGithubPullRequest,
} from './qaap-github-api';
import { readQaapGithubOAuthConfig } from './qaap-github-oauth-config';
import { QaapGithubSessionStore } from './qaap-github-session-store';
import { QaapProjectSessionStore } from './qaap-project-session-store';

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_OAUTH_SCOPE = 'read:user repo';
const THEIA_EMPTY_WINDOW_HASH = '!empty';
// Production deployments mount `/workspace` for the container; local dev (macOS/Windows) cannot
// create folders at the filesystem root, so fall back to a writable per-user directory by default.
const QAAP_REPOS_ROOT = process.env.QAAP_REPOS_ROOT
    || (process.env.NODE_ENV === 'production' ? '/workspace/repos' : path.join(os.homedir(), '.qaap', 'workspaces'));

@injectable()
export class QaapGithubOauthEndpoint implements BackendApplicationContribution {

    @inject(QaapGithubSessionStore)
    protected readonly sessions: QaapGithubSessionStore;

    @inject(QaapProjectSessionStore)
    protected readonly projectSessions: QaapProjectSessionStore;

    @inject(WorkspaceServer)
    protected readonly workspaceServer: WorkspaceServer;

    configure(app: Application): void {
        app.use(json());
        app.get(QAAP_GITHUB_OAUTH_START_PATH, (req, res) => this.handleOAuthStart(req, res));
        app.get(QAAP_GITHUB_OAUTH_CALLBACK_PATH, (req, res) => this.handleOAuthCallback(req, res));
        app.get(`${QAAP_AUTH_API_PATH}/config`, (req, res) => this.handleAuthConfig(req, res));
        app.get(`${QAAP_AUTH_API_PATH}/session`, (req, res) => this.handleAuthSession(req, res));
        app.post(`${QAAP_AUTH_API_PATH}/signout`, (req, res) => this.handleSignOut(req, res));
        app.get(`${QAAP_GITHUB_API_PATH}/repositories`, (req, res) => this.handleGithubRepositories(req, res));
        app.post(`${QAAP_GITHUB_API_PATH}/repositories`, (req, res) => this.handleCreateGithubRepository(req, res));
        app.post(`${QAAP_GITHUB_API_PATH}/repositories/open`, (req, res) => this.handleCloneGithubRepository(req, res));
        app.get(`${QAAP_GITHUB_API_PATH}/repositories/:owner/:repo/open`, (req, res) => this.handleOpenGithubRepository(req, res));
        app.get(`${QAAP_GITHUB_API_PATH}/pull-requests`, (req, res) => this.handleGithubPullRequests(req, res));
        app.post(`${QAAP_GITHUB_API_PATH}/pull-requests/merge`, (req, res) => this.handleMergeGithubPullRequest(req, res));
        app.get(`${QAAP_GITHUB_API_PATH}/project-sessions`, (req, res) => this.handleProjectSessions(req, res));
        app.post(`${QAAP_GITHUB_API_PATH}/project-sessions`, (req, res) => this.handleUpsertProjectSession(req, res));
    }

    protected handleProjectSessions(req: Request, res: Response): void {
        const stored = this.sessions.getSession(this.readSessionId(req));
        if (!stored) {
            res.status(401).json({ error: 'Not signed in' });
            return;
        }
        res.json({ sessions: this.projectSessions.listForUser(stored.user.login) });
    }

    protected handleUpsertProjectSession(req: Request, res: Response): void {
        const stored = this.sessions.getSession(this.readSessionId(req));
        if (!stored) {
            res.status(401).json({ error: 'Not signed in' });
            return;
        }
        const body = (req.body ?? {}) as Partial<QaapProjectSessionUpsertRequest>;
        if (!body.repoKey || typeof body.repoKey !== 'string') {
            res.status(400).json({ error: 'repoKey is required' });
            return;
        }
        const session = this.projectSessions.upsertForUser(stored.user.login, {
            repoKey: body.repoKey,
            branch: body.branch,
            tokens: body.tokens,
            cost: body.cost,
            agentState: body.agentState,
            lastTask: body.lastTask,
            previewUrl: body.previewUrl,
            bootstrapPhase: body.bootstrapPhase,
        });
        res.json({ session });
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
        const errorDescription = typeof req.query.error_description === 'string' ? req.query.error_description : undefined;
        if (error) {
            console.error('[qaap-oauth] GitHub returned error on callback:', error, errorDescription ?? '');
            this.redirectAfterOAuth(res, config.publicUrl, false, errorDescription || error);
            return;
        }
        const code = typeof req.query.code === 'string' ? req.query.code : undefined;
        const state = typeof req.query.state === 'string' ? req.query.state : undefined;
        if (!code) {
            console.error('[qaap-oauth] Callback missing "code" query parameter');
            this.redirectAfterOAuth(res, config.publicUrl, false, 'missing_code');
            return;
        }
        if (!this.sessions.consumeOAuthState(state)) {
            console.error('[qaap-oauth] OAuth state is unknown or expired (backend likely restarted between /start and /callback). state=', state);
            this.redirectAfterOAuth(res, config.publicUrl, false, 'state_lost');
            return;
        }
        try {
            const accessToken = await exchangeGithubCode(config, code);
            const user = await fetchGithubUser(accessToken);
            const sessionId = this.sessions.createSession({ accessToken, user });
            this.setSessionCookie(res, sessionId);
            console.info('[qaap-oauth] GitHub sign-in OK for user', user.login);
            this.redirectAfterOAuth(res, config.publicUrl, true);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[qaap-oauth] Token exchange or user fetch failed:', message);
            this.redirectAfterOAuth(res, config.publicUrl, false, message);
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

    protected async handleGithubPullRequests(req: Request, res: Response): Promise<void> {
        const stored = this.sessions.getSession(this.readSessionId(req));
        if (!stored) {
            res.status(401).json({ error: 'Not signed in', signedIn: false, pullRequests: [] });
            return;
        }
        try {
            const repository = await this.getCurrentWorkspaceRepository(stored.accessToken);
            const pullRequests = repository ? await fetchGithubPullRequests(stored.accessToken, [repository]) : [];
            res.json({ pullRequests, currentRepository: repository, signedIn: true });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load pull requests';
            res.status(502).json({ error: message, signedIn: true, pullRequests: [] });
        }
    }

    protected async handleMergeGithubPullRequest(req: Request, res: Response): Promise<void> {
        const stored = this.sessions.getSession(this.readSessionId(req));
        if (!stored) {
            res.status(401).json({ error: 'Not signed in' });
            return;
        }
        const body = (req.body ?? {}) as Partial<QaapGithubMergePullRequestRequest>;
        const owner = this.cleanGithubPathSegment(body.owner);
        const repo = this.cleanGithubPathSegment(body.repo);
        const number = typeof body.number === 'number' ? body.number : Number(body.number);
        if (!owner || !repo || !Number.isInteger(number) || number <= 0) {
            res.status(400).json({ error: 'Invalid pull request' });
            return;
        }
        try {
            const repository = await this.getCurrentWorkspaceRepository(stored.accessToken);
            if (!repository) {
                res.status(409).json({ error: 'Open a GitHub repository workspace before merging a pull request' });
                return;
            }
            if (
                repository.owner.toLowerCase() !== owner.toLowerCase()
                || repository.name.toLowerCase() !== repo.toLowerCase()
            ) {
                res.status(403).json({ error: 'Pull request does not belong to the open QAAP workspace repository' });
                return;
            }
            const result = await mergeGithubPullRequest(stored.accessToken, { owner, repo, number });
            res.json(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to merge pull request';
            res.status(502).json({ error: message });
        }
    }

    protected async handleOpenGithubRepository(req: Request, res: Response): Promise<void> {
        const stored = this.sessions.getSession(this.readSessionId(req));
        if (!stored) {
            res.status(401).json({ error: 'Not signed in' });
            return;
        }
        const owner = this.cleanGithubPathSegment(req.params.owner);
        const repoName = this.cleanGithubPathSegment(req.params.repo);
        if (!owner || !repoName) {
            res.status(400).json({ error: 'Invalid repository path' });
            return;
        }
        try {
            const repositories = await fetchGithubRepositories(stored.accessToken);
            const repository = repositories.find(repo =>
                repo.owner.toLowerCase() === owner.toLowerCase()
                && repo.name.toLowerCase() === repoName.toLowerCase()
            );
            if (!repository) {
                res.status(404).json({ error: 'Repository not available for this GitHub session' });
                return;
            }
            const workspacePath = await this.ensureRepositoryWorkspace(repository, stored.accessToken);
            res.json({
                repository,
                workspaceUri: FileUri.create(workspacePath).toString(),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to prepare repository workspace';
            res.status(502).json({ error: message });
        }
    }

    protected async handleCreateGithubRepository(req: Request, res: Response): Promise<void> {
        const stored = this.sessions.getSession(this.readSessionId(req));
        if (!stored) {
            res.status(401).json({ error: 'Not signed in' });
            return;
        }
        const body = (req.body ?? {}) as Partial<QaapGithubCreateRepositoryRequest>;
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!this.isValidRepositoryName(name)) {
            res.status(400).json({ error: 'Invalid repository name' });
            return;
        }
        try {
            const repository = await createGithubRepository(stored.accessToken, {
                name,
                private: body.private ?? true,
                description: typeof body.description === 'string' ? body.description.trim() : undefined,
            });
            const workspacePath = await this.ensureRepositoryWorkspace(repository, stored.accessToken);
            res.json({
                repository,
                workspaceUri: FileUri.create(workspacePath).toString(),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create GitHub repository';
            res.status(502).json({ error: message });
        }
    }

    protected async handleCloneGithubRepository(req: Request, res: Response): Promise<void> {
        const stored = this.sessions.getSession(this.readSessionId(req));
        const body = (req.body ?? {}) as Partial<QaapGithubOpenRepositoryRequest>;
        const parsed = this.parseGithubRepositoryInput(typeof body.repository === 'string' ? body.repository : '');
        if (!parsed) {
            res.status(400).json({ error: 'Enter a GitHub repository as owner/name or URL' });
            return;
        }
        try {
            let repository: QaapGithubRepositorySummary;
            if (stored) {
                const repositories = await fetchGithubRepositories(stored.accessToken);
                repository = repositories.find(repo =>
                    repo.owner.toLowerCase() === parsed.owner.toLowerCase()
                    && repo.name.toLowerCase() === parsed.name.toLowerCase()
                ) ?? await fetchGithubRepository(stored.accessToken, parsed.owner, parsed.name);
            } else {
                repository = await fetchGithubRepository(undefined, parsed.owner, parsed.name);
                if (repository.private) {
                    res.status(401).json({ error: 'Sign in with GitHub to clone private repositories' });
                    return;
                }
            }
            const workspacePath = await this.ensureRepositoryWorkspace(repository, stored?.accessToken);
            res.json({
                repository,
                workspaceUri: FileUri.create(workspacePath).toString(),
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to clone GitHub repository';
            res.status(502).json({ error: message });
        }
    }

    protected cleanGithubPathSegment(value: string | undefined): string | undefined {
        const decoded = typeof value === 'string' ? decodeURIComponent(value).trim() : '';
        if (!/^[A-Za-z0-9_.-]+$/.test(decoded)) {
            return undefined;
        }
        return decoded;
    }

    protected isValidRepositoryName(value: string): boolean {
        return /^[A-Za-z0-9_.-]+$/.test(value) && !value.startsWith('.') && value.length <= 100;
    }

    protected parseGithubRepositoryInput(value: string): { owner: string; name: string } | undefined {
        const trimmed = value.trim().replace(/\.git$/, '');
        if (!trimmed) {
            return undefined;
        }
        const sshMatch = /^git@github\.com:([^/]+)\/(.+)$/i.exec(trimmed);
        if (sshMatch) {
            return this.parseGithubRepositoryInput(`${sshMatch[1]}/${sshMatch[2]}`);
        }
        let candidate = trimmed;
        try {
            const url = new URL(trimmed);
            if (url.hostname.toLowerCase() !== 'github.com') {
                return undefined;
            }
            candidate = url.pathname.replace(/^\/+/, '');
        } catch {
            /* owner/name input */
        }
        const [owner, name, ...rest] = candidate.split('/').filter(Boolean);
        if (rest.length > 0) {
            return undefined;
        }
        const cleanOwner = this.cleanGithubPathSegment(owner);
        const cleanName = this.cleanGithubPathSegment(name);
        if (!cleanOwner || !cleanName) {
            return undefined;
        }
        return { owner: cleanOwner, name: cleanName };
    }

    protected async getCurrentWorkspaceRepository(accessToken: string): Promise<QaapGithubRepositorySummary | undefined> {
        const workspaceUri = await this.workspaceServer.getMostRecentlyUsedWorkspace();
        if (!workspaceUri) {
            return undefined;
        }
        const workspacePath = FileUri.fsPath(workspaceUri);
        const gitRoot = await this.findGitRoot(workspacePath);
        if (!gitRoot) {
            return undefined;
        }
        const remoteUrl = await this.runGitOutput(['-C', gitRoot, 'remote', 'get-url', 'origin']).catch(() => undefined);
        const parsed = remoteUrl ? this.parseGithubRepositoryInput(remoteUrl) : undefined;
        if (!parsed) {
            return undefined;
        }
        return fetchGithubRepository(accessToken, parsed.owner, parsed.name);
    }

    protected async findGitRoot(workspacePath: string): Promise<string | undefined> {
        let candidate = workspacePath;
        try {
            const stat = await fs.stat(candidate);
            if (stat.isFile()) {
                candidate = path.dirname(candidate);
            }
        } catch {
            return undefined;
        }
        const output = await this.runGitOutput(['-C', candidate, 'rev-parse', '--show-toplevel']).catch(() => undefined);
        return output?.trim() || undefined;
    }

    protected async ensureRepositoryWorkspace(
        repository: Pick<QaapGithubRepositorySummary, 'owner' | 'name' | 'cloneUrl'>,
        accessToken: string | undefined,
    ): Promise<string> {
        const ownerDir = this.safePathSegment(repository.owner);
        const repoDir = this.safePathSegment(repository.name);
        const target = path.join(QAAP_REPOS_ROOT, ownerDir, repoDir);
        await fs.mkdir(path.dirname(target), { recursive: true });
        if (await this.isGitRepository(target)) {
            await this.runGit(['-C', target, 'fetch', '--all', '--prune'], accessToken);
            await this.runGit(['-C', target, 'pull', '--ff-only'], accessToken);
            return target;
        }
        if (await this.pathExists(target)) {
            const entries = await fs.readdir(target);
            if (entries.length > 0) {
                throw new Error(`Workspace path already exists and is not a Git repository: ${target}`);
            }
        }
        await this.runGit(['clone', repository.cloneUrl, target], accessToken);
        return target;
    }

    protected safePathSegment(value: string): string {
        return value.replace(/[^A-Za-z0-9_.-]/g, '_');
    }

    protected async isGitRepository(target: string): Promise<boolean> {
        try {
            const stat = await fs.stat(path.join(target, '.git'));
            return stat.isDirectory() || stat.isFile();
        } catch {
            return false;
        }
    }

    protected async pathExists(target: string): Promise<boolean> {
        try {
            await fs.access(target);
            return true;
        } catch {
            return false;
        }
    }

    protected runGit(args: string[], accessToken: string | undefined): Promise<void> {
        const gitArgs = accessToken
            ? [
                '-c',
                `http.https://github.com/.extraheader=AUTHORIZATION: basic ${
                    Buffer.from(`x-access-token:${accessToken}`).toString('base64')
                }`,
                ...args,
            ]
            : args;
        return new Promise((resolve, reject) => {
            const child = spawn('git', gitArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
            let stderr = '';
            child.stderr.on('data', chunk => {
                stderr += String(chunk);
            });
            child.on('error', reject);
            child.on('close', code => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(stderr.trim() || `git exited with status ${code}`));
                }
            });
        });
    }

    protected runGitOutput(args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const child = spawn('git', args, { stdio: ['ignore', 'pipe', 'pipe'] });
            let stdout = '';
            let stderr = '';
            child.stdout.on('data', chunk => {
                stdout += String(chunk);
            });
            child.stderr.on('data', chunk => {
                stderr += String(chunk);
            });
            child.on('error', reject);
            child.on('close', code => {
                if (code === 0) {
                    resolve(stdout.trim());
                } else {
                    reject(new Error(stderr.trim() || `git exited with status ${code}`));
                }
            });
        });
    }

    protected redirectAfterOAuth(res: Response, publicUrl: string, success: boolean, reason?: string): void {
        const target = new URL(publicUrl + '/');
        if (success) {
            target.searchParams.set('qaap_oauth', 'github');
        } else {
            target.searchParams.set('qaap_oauth_error', '1');
            if (reason) {
                target.searchParams.set('qaap_oauth_reason', reason.slice(0, 200));
            }
        }
        // Theia restores the most recent workspace when there is no hash. Use
        // the explicit empty-window hash to avoid reopening a stale workspace.
        res.redirect(302, `${target.toString()}#${THEIA_EMPTY_WINDOW_HASH}`);
    }

    protected readSessionId(req: Request): string | undefined {
        const cookieHeader = req.headers.cookie;
        if (cookieHeader && typeof cookieHeader === 'string') {
            for (const part of cookieHeader.split(';')) {
                const trimmed = part.trim();
                const eq = trimmed.indexOf('=');
                if (eq <= 0) {
                    continue;
                }
                const name = trimmed.slice(0, eq);
                if (name === QAAP_AUTH_SESSION_COOKIE) {
                    const value = trimmed.slice(eq + 1);
                    if (value) {
                        return decodeURIComponent(value);
                    }
                }
            }
        }
        const sessionHeader = req.headers[QAAP_AUTH_SESSION_HEADER];
        if (typeof sessionHeader === 'string' && sessionHeader.length > 0) {
            return sessionHeader;
        }
        return undefined;
    }

    protected sessionCookieFlags(): string {
        const config = readQaapGithubOAuthConfig();
        const secure = config?.publicUrl.startsWith('https://') ? '; Secure' : '';
        return `Path=/; HttpOnly; SameSite=Lax${secure}`;
    }

    protected setSessionCookie(res: Response, sessionId: string): void {
        const maxAge = 30 * 24 * 60 * 60;
        res.setHeader(
            'Set-Cookie',
            `${QAAP_AUTH_SESSION_COOKIE}=${encodeURIComponent(sessionId)}; ${this.sessionCookieFlags()}; Max-Age=${maxAge}`
        );
    }

    protected clearSessionCookie(res: Response): void {
        res.setHeader(
            'Set-Cookie',
            `${QAAP_AUTH_SESSION_COOKIE}=; ${this.sessionCookieFlags()}; Max-Age=0`
        );
    }
}
