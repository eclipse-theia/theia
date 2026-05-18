// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapAuthSessionUser, QaapGithubRepositorySummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import type { QaapGithubOAuthConfig } from './qaap-github-oauth-config';

interface GithubTokenResponse {
    access_token?: string;
    error?: string;
    error_description?: string;
}

interface GithubUserResponse {
    login: string;
    name?: string | null;
    avatar_url?: string;
}

interface GithubRepoResponse {
    id: number;
    full_name: string;
    name: string;
    owner: { login: string };
    clone_url: string;
    html_url: string;
    default_branch: string;
    private: boolean;
    description?: string | null;
    updated_at: string;
}

export async function exchangeGithubCode(
    config: QaapGithubOAuthConfig,
    code: string
): Promise<string> {
    const body = new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
    });
    const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
            Accept: 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
    });
    const data = await response.json() as GithubTokenResponse;
    if (!response.ok || !data.access_token) {
        throw new Error(data.error_description || data.error || 'GitHub token exchange failed');
    }
    return data.access_token;
}

export async function fetchGithubUser(accessToken: string): Promise<QaapAuthSessionUser> {
    const response = await fetch('https://api.github.com/user', {
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${accessToken}`,
            'User-Agent': 'Qaap-Theia',
        },
    });
    if (!response.ok) {
        throw new Error(`GitHub user API failed (${response.status})`);
    }
    const user = await response.json() as GithubUserResponse;
    return {
        provider: 'github',
        login: user.login,
        name: user.name?.trim() || user.login,
        avatarUrl: user.avatar_url,
    };
}

export async function fetchGithubRepositories(accessToken: string): Promise<QaapGithubRepositorySummary[]> {
    const repos: QaapGithubRepositorySummary[] = [];
    let page = 1;
    const perPage = 100;
    while (page <= 5) {
        const url = new URL('https://api.github.com/user/repos');
        url.searchParams.set('per_page', String(perPage));
        url.searchParams.set('page', String(page));
        url.searchParams.set('sort', 'updated');
        url.searchParams.set('direction', 'desc');
        const response = await fetch(url.toString(), {
            headers: {
                Accept: 'application/vnd.github+json',
                Authorization: `Bearer ${accessToken}`,
                'User-Agent': 'Qaap-Theia',
            },
        });
        if (!response.ok) {
            throw new Error(`GitHub repositories API failed (${response.status})`);
        }
        const batch = await response.json() as GithubRepoResponse[];
        if (batch.length === 0) {
            break;
        }
        for (const repo of batch) {
            repos.push({
                id: repo.id,
                fullName: repo.full_name,
                owner: repo.owner.login,
                name: repo.name,
                cloneUrl: repo.clone_url,
                htmlUrl: repo.html_url,
                defaultBranch: repo.default_branch,
                private: repo.private,
                description: repo.description ?? undefined,
                updatedAt: repo.updated_at,
            });
        }
        if (batch.length < perPage) {
            break;
        }
        page += 1;
    }
    return repos;
}
