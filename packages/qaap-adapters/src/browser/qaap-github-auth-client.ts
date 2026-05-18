// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import {
    QAAP_AUTH_API_PATH,
    QAAP_GITHUB_API_PATH,
    QAAP_GITHUB_OAUTH_START_PATH,
    type QaapAuthConfigResponse,
    type QaapAuthSessionResponse,
    type QaapGithubRepositoriesResponse,
} from '../common/qaap-github-api-types';
import {
    clearQaapAuthSession,
    writeQaapAuthSession,
    type QaapAuthProvider,
} from './qaap-auth-session';

const FETCH_INIT: RequestInit = { credentials: 'include' };

export const QAAP_REQUIRE_LOGIN_EVENT = 'qaap-require-login';

export async function fetchQaapAuthConfig(): Promise<QaapAuthConfigResponse> {
    const response = await fetch(`${QAAP_AUTH_API_PATH}/config`, FETCH_INIT);
    if (!response.ok) {
        return { githubOAuth: false };
    }
    return response.json() as Promise<QaapAuthConfigResponse>;
}

export async function fetchQaapAuthSession(): Promise<QaapAuthSessionResponse> {
    const response = await fetch(`${QAAP_AUTH_API_PATH}/session`, FETCH_INIT);
    if (!response.ok) {
        return { signedIn: false };
    }
    return response.json() as Promise<QaapAuthSessionResponse>;
}

export async function fetchQaapGithubRepositories(): Promise<QaapGithubRepositoriesResponse> {
    const response = await fetch(`${QAAP_GITHUB_API_PATH}/repositories`, FETCH_INIT);
    if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || `Failed to load GitHub repositories (${response.status})`);
    }
    return response.json() as Promise<QaapGithubRepositoriesResponse>;
}

export function startGithubOAuth(): void {
    window.location.assign(QAAP_GITHUB_OAUTH_START_PATH);
}

export async function signOutQaapAuth(): Promise<void> {
    try {
        await fetch(`${QAAP_AUTH_API_PATH}/signout`, { ...FETCH_INIT, method: 'POST' });
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

export function consumeQaapOAuthReturnFromUrl(): 'github' | 'error' | undefined {
    if (typeof window === 'undefined') {
        return undefined;
    }
    const params = new URLSearchParams(window.location.search);
    if (params.has('qaap_oauth_error')) {
        const next = new URL(window.location.href);
        next.searchParams.delete('qaap_oauth_error');
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
