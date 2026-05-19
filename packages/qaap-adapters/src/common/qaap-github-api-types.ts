// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const QAAP_AUTH_API_PATH = '/qaap/api/auth';
export const QAAP_GITHUB_API_PATH = '/qaap/api/github';
export const QAAP_GITHUB_OAUTH_START_PATH = '/qaap/oauth/github/start';
/** Must match GitHub OAuth App «Authorization callback URL». */
export const QAAP_GITHUB_OAUTH_CALLBACK_PATH = '/qaap/oauth/github/callback';

export const QAAP_AUTH_SESSION_COOKIE = 'qaap_sid';
export const QAAP_AUTH_SESSION_ID_STORAGE_KEY = 'qaap.auth.sessionId';

export interface QaapAuthConfigResponse {
    githubOAuth: boolean;
    /** Local dev: skip login gate and use a placeholder session (`QAAP_SKIP_AUTH=true`). */
    skipAuth?: boolean;
}

export interface QaapAuthSessionUser {
    provider: 'github' | 'gitlab';
    login: string;
    name: string;
    avatarUrl?: string;
}

export interface QaapAuthSessionResponse {
    signedIn: boolean;
    user?: QaapAuthSessionUser;
    sessionId?: string;
}

export interface QaapGithubRepositorySummary {
    id: number;
    fullName: string;
    owner: string;
    name: string;
    cloneUrl: string;
    htmlUrl: string;
    defaultBranch: string;
    private: boolean;
    description?: string;
    updatedAt: string;
}

export interface QaapGithubRepositoriesResponse {
    repositories: QaapGithubRepositorySummary[];
}

export interface QaapGithubOpenRepositoryResponse {
    repository: QaapGithubRepositorySummary;
    workspaceUri: string;
}

export interface QaapGithubCreateRepositoryRequest {
    name: string;
    private?: boolean;
    description?: string;
}

export interface QaapGithubOpenRepositoryRequest {
    repository: string;
}

export type QaapGithubPullRequestLineType = 'add' | 'del' | 'ctx';

export interface QaapGithubPullRequestLine {
    t: QaapGithubPullRequestLineType;
    n: number;
    s: string;
}

export interface QaapGithubPullRequestFile {
    f: string;
    ext: string;
    adds: number;
    dels: number;
    preview: QaapGithubPullRequestLine[];
}

export interface QaapGithubPullRequestSummary {
    owner: string;
    repo: string;
    number: number;
    title: string;
    branch: string;
    base: string;
    author: string;
    files: number;
    adds: number;
    dels: number;
    tests: 'passing' | 'failing' | 'pending' | 'unknown';
    htmlUrl: string;
    mergeable?: boolean;
    filesPreview: QaapGithubPullRequestFile[];
}

export interface QaapGithubPullRequestsResponse {
    pullRequests: QaapGithubPullRequestSummary[];
    /** Repo derived from the currently-open workspace (when detectable). */
    currentRepository?: QaapGithubRepositorySummary;
    /** False when the request was rejected because the session is missing/expired. */
    signedIn: boolean;
}

export interface QaapGithubMergePullRequestRequest {
    owner: string;
    repo: string;
    number: number;
}

export interface QaapGithubMergePullRequestResponse {
    merged: boolean;
    message: string;
    sha?: string;
}
