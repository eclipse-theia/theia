// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    QAAP_AUTH_API_PATH,
    QAAP_AUTH_SESSION_HEADER,
    QAAP_GITHUB_API_PATH,
    QAAP_TEMPLATES_API_PATH,
    QAAP_GITHUB_OAUTH_START_PATH,
    type QaapAuthConfigResponse,
    type QaapAuthSessionResponse,
    type QaapGithubCreateRepositoryRequest,
    type QaapGithubMergePullRequestRequest,
    type QaapGithubMergePullRequestResponse,
    type QaapGithubOpenRepositoryResponse,
    type QaapGithubOpenRepositoryRequest,
    type QaapGithubPullRequestsResponse,
    type QaapGithubRepositoriesResponse,
    type QaapProjectSessionsResponse,
    type QaapProjectSessionUpsertRequest,
    type QaapProjectSessionSummary,
    type QaapScaffoldTemplateResponse,
} from '../common/qaap-github-api-types';
import {
    clearQaapAuthSession,
    readQaapAuthSessionId,
    writeQaapAuthSession,
    type QaapAuthProvider,
} from './qaap-auth-session';

/** Include session cookie and, when known, the stored session id for VPS/container restarts. */
export function qaapAuthenticatedFetchInit(extra?: RequestInit): RequestInit {
    const headers = new Headers(extra?.headers);
    const sessionId = readQaapAuthSessionId();
    if (sessionId) {
        headers.set(QAAP_AUTH_SESSION_HEADER, sessionId);
    }
    return {
        credentials: 'include',
        ...extra,
        headers,
    };
}

export const QAAP_REQUIRE_LOGIN_EVENT = 'qaap-require-login';

export async function fetchQaapAuthConfig(): Promise<QaapAuthConfigResponse> {
    const response = await fetch(`${QAAP_AUTH_API_PATH}/config`, qaapAuthenticatedFetchInit());
    if (!response.ok) {
        return { githubOAuth: false };
    }
    return response.json() as Promise<QaapAuthConfigResponse>;
}

export async function fetchQaapAuthSession(): Promise<QaapAuthSessionResponse> {
    const response = await fetch(`${QAAP_AUTH_API_PATH}/session`, qaapAuthenticatedFetchInit());
    if (!response.ok) {
        return { signedIn: false };
    }
    return response.json() as Promise<QaapAuthSessionResponse>;
}

export async function fetchQaapProjectSessions(): Promise<QaapProjectSessionsResponse> {
    const response = await fetch(`${QAAP_GITHUB_API_PATH}/project-sessions`, qaapAuthenticatedFetchInit());
    if (response.status === 401) {
        return { sessions: [] };
    }
    if (!response.ok) {
        return { sessions: [] };
    }
    const body = await response.json() as Partial<QaapProjectSessionsResponse>;
    return { sessions: Array.isArray(body.sessions) ? body.sessions : [] };
}

export async function upsertQaapProjectSession(patch: QaapProjectSessionUpsertRequest): Promise<QaapProjectSessionSummary | undefined> {
    const response = await fetch(`${QAAP_GITHUB_API_PATH}/project-sessions`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
    }));
    if (!response.ok) {
        return undefined;
    }
    const body = await response.json() as { session?: QaapProjectSessionSummary };
    return body.session;
}

export async function scaffoldQaapProjectTemplate(templateId: string, projectName?: string): Promise<QaapScaffoldTemplateResponse> {
    const response = await fetch(`${QAAP_TEMPLATES_API_PATH}/scaffold`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, projectName }),
    }));
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Template scaffold failed (${response.status})`);
    }
    return response.json() as Promise<QaapScaffoldTemplateResponse>;
}

export async function fetchQaapGithubRepositories(): Promise<QaapGithubRepositoriesResponse> {
    const response = await fetch(`${QAAP_GITHUB_API_PATH}/repositories`, qaapAuthenticatedFetchInit());
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `Failed to load GitHub repositories (${response.status})`);
    }
    return response.json() as Promise<QaapGithubRepositoriesResponse>;
}

export async function fetchQaapGithubPullRequests(): Promise<QaapGithubPullRequestsResponse> {
    const response = await fetch(`${QAAP_GITHUB_API_PATH}/pull-requests`, qaapAuthenticatedFetchInit());
    if (response.status === 401) {
        return { pullRequests: [], signedIn: false };
    }
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `Failed to load GitHub pull requests (${response.status})`);
    }
    const body = await response.json() as Partial<QaapGithubPullRequestsResponse>;
    return {
        pullRequests: Array.isArray(body.pullRequests) ? body.pullRequests : [],
        currentRepository: body.currentRepository,
        signedIn: body.signedIn !== false,
    };
}

export async function mergeQaapGithubPullRequest(request: QaapGithubMergePullRequestRequest): Promise<QaapGithubMergePullRequestResponse> {
    const response = await fetch(`${QAAP_GITHUB_API_PATH}/pull-requests/merge`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    }));
    const body = await response.json().catch(() => ({})) as Partial<QaapGithubMergePullRequestResponse> & { error?: string };
    if (!response.ok) {
        throw new Error(body.error || `Failed to merge pull request (${response.status})`);
    }
    return body as QaapGithubMergePullRequestResponse;
}

export async function openQaapGithubRepository(owner: string, name: string): Promise<QaapGithubOpenRepositoryResponse> {
    const url = `${QAAP_GITHUB_API_PATH}/repositories/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/open`;
    const response = await fetch(url, qaapAuthenticatedFetchInit());
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `Failed to open GitHub repository (${response.status})`);
    }
    return response.json() as Promise<QaapGithubOpenRepositoryResponse>;
}

export async function createQaapGithubRepository(request: QaapGithubCreateRepositoryRequest): Promise<QaapGithubOpenRepositoryResponse> {
    const response = await fetch(`${QAAP_GITHUB_API_PATH}/repositories`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    }));
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `Failed to create GitHub repository (${response.status})`);
    }
    return response.json() as Promise<QaapGithubOpenRepositoryResponse>;
}

export async function cloneQaapGithubRepository(repository: string): Promise<QaapGithubOpenRepositoryResponse> {
    const request: QaapGithubOpenRepositoryRequest = { repository };
    const response = await fetch(`${QAAP_GITHUB_API_PATH}/repositories/open`, qaapAuthenticatedFetchInit({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
    }));
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `Failed to clone GitHub repository (${response.status})`);
    }
    return response.json() as Promise<QaapGithubOpenRepositoryResponse>;
}

export function startGithubOAuth(): void {
    window.location.assign(QAAP_GITHUB_OAUTH_START_PATH);
}

export async function signOutQaapAuth(): Promise<void> {
    try {
        await fetch(`${QAAP_AUTH_API_PATH}/signout`, qaapAuthenticatedFetchInit({ method: 'POST' }));
    } catch {
        /* still clear local session */
    }
    clearQaapAuthSession();
}

/** Apply server session to local storage; returns true when signed in. */
export async function syncQaapAuthSessionFromServer(): Promise<boolean> {
    const session = await fetchQaapAuthSession();
    if (!session.signedIn || !session.user) {
        clearQaapAuthSession();
        return false;
    }
    writeQaapAuthSession(session.user.provider as QaapAuthProvider, session.user, session.sessionId);
    return true;
}

/** True while the URL still carries OAuth return params (before {@link consumeQaapOAuthReturnFromUrl}). */
export function peekQaapOAuthReturnFromUrl(): 'github' | 'error' | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has('qaap_oauth_error')) {
        return 'error';
    }
    if (params.get('qaap_oauth') === 'github') {
        return 'github';
    }
    return undefined;
}

/** Remove login gate DOM/CSS so the workbench is visible again. */
export function revealQaapWorkbenchAfterAuth(): void {
    if (typeof document === 'undefined') {
        return;
    }
    document.body.classList.remove('qaap-login-active');
    document.getElementById('qaap-login-host')?.remove();
}

/**
 * Clean OAuth query params from the URL. When `clearHash` is true (fresh GitHub sign-in),
 * drop the hash so Theia does not boot into a stale workspace route before the shell is ready.
 */
export function stripQaapOAuthParamsFromUrl(clearHash = false, forceEmptyWindow = false): void {
    if (typeof window === 'undefined') {
        return;
    }
    const url = new URL(window.location.href);
    url.searchParams.delete('qaap_oauth');
    url.searchParams.delete('qaap_oauth_error');
    if (forceEmptyWindow) {
        url.hash = '!empty';
    } else if (clearHash) {
        url.hash = '';
    }
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

/** Sync session after GitHub redirect; reveal IDE and normalize the URL when successful. */
export async function completeQaapGithubOAuthReturn(): Promise<boolean> {
    if (peekQaapOAuthReturnFromUrl() !== 'github') {
        return false;
    }
    const ok = await syncQaapAuthSessionFromServer();
    consumeQaapOAuthReturnFromUrl();
    if (ok) {
        revealQaapWorkbenchAfterAuth();
        // Keep #!empty from the OAuth redirect; only strip query params so workspace restore stays stable.
        stripQaapOAuthParamsFromUrl(false);
    }
    return ok;
}

/** Backend-provided machine-readable reason for the last failed OAuth callback. */
export function peekQaapOAuthErrorReasonFromUrl(): string | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }
    const reason = new URLSearchParams(window.location.search).get('qaap_oauth_reason');
    return reason && reason.length > 0 ? reason : undefined;
}

export function consumeQaapOAuthReturnFromUrl(): 'github' | 'error' | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has('qaap_oauth_error')) {
        const next = new URL(window.location.href);
        next.searchParams.delete('qaap_oauth_error');
        next.searchParams.delete('qaap_oauth_reason');
        window.history.replaceState({}, '', next.pathname + next.search + next.hash);
        return 'error';
    }
    const provider = params.get('qaap_oauth');
    if (provider === 'github') {
        const next = new URL(window.location.href);
        next.searchParams.delete('qaap_oauth');
        window.history.replaceState({}, '', next.pathname + next.search + next.hash);
        return 'github';
    }
    return undefined;
}
