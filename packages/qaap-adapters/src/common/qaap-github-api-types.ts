// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export const QAAP_AUTH_API_PATH = '/qaap/api/auth';
export const QAAP_GITHUB_API_PATH = '/qaap/api/github';
export const QAAP_GITHUB_OAUTH_START_PATH = '/qaap/oauth/github/start';

export const QAAP_AUTH_SESSION_COOKIE = 'qaap_sid';
export const QAAP_AUTH_SESSION_ID_STORAGE_KEY = 'qaap.auth.sessionId';

export interface QaapAuthConfigResponse {
    githubOAuth: boolean;
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
