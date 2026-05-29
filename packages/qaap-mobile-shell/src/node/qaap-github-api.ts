// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type {
    QaapAuthSessionUser,
    QaapGithubMergePullRequestResponse,
    QaapGithubPullRequestFile,
    QaapGithubPullRequestLine,
    QaapGithubPullRequestSummary,
    QaapGithubRepositorySummary,
} from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
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

interface GithubCreateRepoResponse extends GithubRepoResponse {
}

interface GithubPullResponse {
    number: number;
    title: string;
    html_url: string;
    updated_at: string;
    user?: { login?: string | null } | null;
    head: { ref: string; sha: string; repo?: { full_name?: string | null } | null };
    base: { ref: string };
    changed_files: number;
    additions: number;
    deletions: number;
    mergeable?: boolean | null;
}

interface GithubPullFileResponse {
    filename: string;
    additions: number;
    deletions: number;
    patch?: string;
}

interface GithubMergePullResponse {
    merged?: boolean;
    message?: string;
    sha?: string;
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
    while (true) {
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

export async function fetchGithubRepository(accessToken: string | undefined, owner: string, name: string): Promise<QaapGithubRepositorySummary> {
    const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`, {
        headers: githubHeaders(accessToken),
    });
    if (!response.ok) {
        throw new Error(`GitHub repository API failed (${response.status})`);
    }
    return githubRepoToSummary(await response.json() as GithubRepoResponse);
}

export async function createGithubRepository(
    accessToken: string,
    input: { name: string; private?: boolean; description?: string }
): Promise<QaapGithubRepositorySummary> {
    const response = await fetch('https://api.github.com/user/repos', {
        method: 'POST',
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Qaap-Theia',
        },
        body: JSON.stringify({
            name: input.name,
            private: input.private ?? true,
            description: input.description || undefined,
            auto_init: true,
        }),
    });
    const data = await response.json() as GithubCreateRepoResponse & { message?: string };
    if (!response.ok) {
        throw new Error(data.message || `GitHub create repository API failed (${response.status})`);
    }
    return githubRepoToSummary(data);
}

export async function fetchGithubPullRequests(
    accessToken: string,
    repositories: QaapGithubRepositorySummary[],
): Promise<QaapGithubPullRequestSummary[]> {
    const pulls: QaapGithubPullRequestSummary[] = [];
    const reposToScan = repositories.slice(0, 30);
    const maxTotal = Math.min(24, Math.max(8, repositories.length * 2));
    for (const repo of reposToScan) {
        if (pulls.length >= maxTotal) {
            break;
        }
        const url = new URL(`https://api.github.com/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/pulls`);
        url.searchParams.set('state', 'open');
        url.searchParams.set('per_page', '3');
        const response = await fetch(url.toString(), {
            headers: githubHeaders(accessToken),
        });
        if (!response.ok) {
            continue;
        }
        const batch = await response.json() as GithubPullResponse[];
        for (const pull of batch) {
            if (pulls.length >= maxTotal) {
                break;
            }
            const filesPreview = await fetchGithubPullRequestFiles(accessToken, repo.owner, repo.name, pull.number);
            pulls.push({
                owner: repo.owner,
                repo: repo.name,
                number: pull.number,
                title: pull.title,
                branch: pull.head.ref,
                base: pull.base.ref,
                author: pull.user?.login || 'unknown',
                files: pull.changed_files,
                adds: pull.additions,
                dels: pull.deletions,
                tests: 'unknown',
                htmlUrl: pull.html_url,
                mergeable: pull.mergeable ?? undefined,
                filesPreview,
                updatedAt: pull.updated_at,
            });
        }
    }
    return pulls;
}

export async function mergeGithubPullRequest(
    accessToken: string,
    input: { owner: string; repo: string; number: number }
): Promise<QaapGithubMergePullRequestResponse> {
    const response = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(input.owner)}/${encodeURIComponent(input.repo)}/pulls/${input.number}/merge`,
        {
            method: 'PUT',
            headers: {
                ...githubHeaders(accessToken),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                merge_method: 'merge',
                commit_title: `Merge pull request #${input.number}`,
            }),
        }
    );
    const body = await response.json().catch(() => ({})) as GithubMergePullResponse;
    if (!response.ok) {
        throw new Error(body.message || `GitHub merge API failed (${response.status})`);
    }
    return {
        merged: body.merged === true,
        message: body.message || 'Pull request merged.',
        sha: body.sha,
    };
}

export async function fetchGithubPullRequestFiles(
    accessToken: string,
    owner: string,
    repo: string,
    number: number,
): Promise<QaapGithubPullRequestFile[]> {
    const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/files`);
    url.searchParams.set('per_page', '8');
    const response = await fetch(url.toString(), {
        headers: githubHeaders(accessToken),
    });
    if (!response.ok) {
        return [];
    }
    const files = await response.json() as GithubPullFileResponse[];
    return files.slice(0, 8).map(file => ({
        f: file.filename,
        ext: fileExtension(file.filename),
        adds: file.additions,
        dels: file.deletions,
        preview: parseGithubPatch(file.patch),
    }));
}

function parseGithubPatch(patch: string | undefined): QaapGithubPullRequestLine[] {
    if (!patch) {
        return [];
    }
    const preview: QaapGithubPullRequestLine[] = [];
    let oldLine = 0;
    let newLine = 0;
    for (const line of patch.split('\n')) {
        if (preview.length >= 16) {
            break;
        }
        const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
        if (hunk) {
            oldLine = Number(hunk[1]);
            newLine = Number(hunk[2]);
            continue;
        }
        if (line.startsWith('+++') || line.startsWith('---')) {
            continue;
        }
        if (line.startsWith('+')) {
            preview.push({ t: 'add', n: newLine++, s: line.slice(1) });
        } else if (line.startsWith('-')) {
            preview.push({ t: 'del', n: oldLine++, s: line.slice(1) });
        } else {
            preview.push({ t: 'ctx', n: newLine, s: line.startsWith(' ') ? line.slice(1) : line });
            oldLine += 1;
            newLine += 1;
        }
    }
    return preview;
}

function fileExtension(filename: string): string {
    const basename = filename.split('/').pop() || filename;
    const dot = basename.lastIndexOf('.');
    return dot > 0 ? basename.slice(dot + 1, dot + 5).toLowerCase() : 'file';
}

function githubHeaders(accessToken?: string): Record<string, string> {
    const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Qaap-Theia',
    };
    if (accessToken) {
        headers.Authorization = `Bearer ${accessToken}`;
    }
    return headers;
}

function githubRepoToSummary(repo: GithubRepoResponse): QaapGithubRepositorySummary {
    return {
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
    };
}
