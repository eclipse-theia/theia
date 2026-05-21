// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const QAAP_AUTH_API_PATH = '/qaap/api/auth';
export const QAAP_GITHUB_API_PATH = '/qaap/api/github';
export const QAAP_TEMPLATES_API_PATH = '/qaap/api/templates';
export const QAAP_GITHUB_OAUTH_START_PATH = '/qaap/oauth/github/start';
/** Must match GitHub OAuth App «Authorization callback URL». */
export const QAAP_GITHUB_OAUTH_CALLBACK_PATH = '/qaap/oauth/github/callback';

export const QAAP_AUTH_SESSION_COOKIE = 'qaap_sid';
/** Fallback when HttpOnly cookies are dropped (e.g. after a container restart with a stale browser cookie). */
export const QAAP_AUTH_SESSION_HEADER = 'x-qaap-session-id';
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

/** Per-repository agent/dev session snapshot (hub + KPI). */
export interface QaapProjectSessionSummary {
    /** Stable key, e.g. `github:owner/repo` or `ws:file:///path`. */
    readonly repoKey: string;
    readonly branch: string;
    readonly tokens?: string;
    readonly cost?: string;
    readonly agentState?: 'idle' | 'working' | 'review';
    readonly lastTask?: string;
    readonly lastActiveAt?: string;
    readonly previewUrl?: string;
    readonly bootstrapPhase?: string;
}

export interface QaapProjectSessionsResponse {
    readonly sessions: QaapProjectSessionSummary[];
}

export interface QaapScaffoldTemplateRequest {
    readonly templateId: string;
    readonly projectName?: string;
}

export interface QaapScaffoldTemplateResponse {
    readonly workspaceUri: string;
    readonly templateId: string;
}

export interface QaapProjectSessionUpsertRequest {
    readonly repoKey: string;
    readonly branch?: string;
    readonly tokens?: string;
    readonly cost?: string;
    readonly agentState?: QaapProjectSessionSummary['agentState'];
    readonly lastTask?: string;
    readonly previewUrl?: string;
    readonly bootstrapPhase?: string;
}
