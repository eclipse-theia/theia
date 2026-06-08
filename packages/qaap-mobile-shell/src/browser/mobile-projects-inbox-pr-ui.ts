// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';
import {
    fetchQaapAuthConfig,
    fetchQaapAuthSession,
    fetchQaapGithubPullRequests,
} from '@theia/qaap-adapters/lib/browser/qaap-github-auth-client';
import { clearQaapAuthSession, readQaapSignedIn } from '@theia/qaap-adapters/lib/browser/qaap-auth-session';
import { githubRepoKeysForProjects, pullRequestKey } from './mobile-work-hub-inbox';
import type { MobileWorkHubInboxStream } from './mobile-work-hub-inbox-stream';
import type { MobileProjectEntry, MobileProjectsHubView } from './mobile-projects-types';

export const MOBILE_PROJECTS_INBOX_PR_FETCH_TIMEOUT_MS = 20_000;

/** Panel surface for GitHub pull-request polling used by Review / Home hubs. */
export interface MobileProjectsInboxPrHost {
    visible: boolean;
    hubView: MobileProjectsHubView;
    transcriptSheet: HTMLElement | undefined;
    inboxLoadGeneration: number;
    inboxPullRequests: QaapGithubPullRequestSummary[];
    inboxPullRequestsLoading: boolean;
    inboxPullRequestsLoaded: boolean;
    inboxGithubSignedIn: boolean | undefined;
    inboxPullRequestsAbort: AbortController | undefined;
    inboxStream: MobileWorkHubInboxStream | undefined;

    projectsForCurrentHubList(): MobileProjectEntry[];
    renderList(): void;
}

/** Fetches and merges inbox pull requests for the Work Hub review surface. */
export class MobileProjectsInboxPrUi {

    constructor(protected readonly host: MobileProjectsInboxPrHost) { }

    resetInboxPullRequestState(): void {
        this.host.inboxPullRequestsAbort?.abort();
        this.host.inboxPullRequestsAbort = undefined;
        this.host.inboxPullRequests = [];
        this.host.inboxPullRequestsLoaded = false;
        this.host.inboxPullRequestsLoading = false;
        this.host.inboxGithubSignedIn = undefined;
    }

    finishInboxPullRequestLoad(generation: number): void {
        if (generation !== this.host.inboxLoadGeneration) {
            this.host.inboxPullRequestsLoading = false;
            return;
        }
        this.host.inboxPullRequestsLoaded = true;
        this.host.inboxPullRequestsLoading = false;
        if (this.host.visible && (this.host.hubView === 'review' || this.host.hubView === 'home')) {
            this.host.renderList();
        }
    }

    mergeInboxPullRequests(polled: QaapGithubPullRequestSummary[]): QaapGithubPullRequestSummary[] {
        const live = this.host.inboxStream?.getLivePullRequests() ?? [];
        const merged = new Map<string, QaapGithubPullRequestSummary>();
        for (const pullRequest of polled) {
            merged.set(pullRequestKey(pullRequest), pullRequest);
        }
        for (const pullRequest of live) {
            merged.set(pullRequestKey(pullRequest), pullRequest);
        }
        return [...merged.values()].sort(
            (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
        );
    }

    async refreshInboxPullRequests(
        projects: MobileProjectEntry[] = this.host.projectsForCurrentHubList(),
        force = false,
    ): Promise<void> {
        if (this.host.inboxPullRequestsLoading && !force) {
            return;
        }
        const generation = this.host.inboxLoadGeneration;
        this.host.inboxPullRequestsAbort?.abort();
        const abort = new AbortController();
        this.host.inboxPullRequestsAbort = abort;
        const timeout = window.setTimeout(() => abort.abort(), MOBILE_PROJECTS_INBOX_PR_FETCH_TIMEOUT_MS);
        this.host.inboxPullRequestsLoading = true;
        const repoKeys = githubRepoKeysForProjects(projects);
        try {
            const config = await fetchQaapAuthConfig().catch(() => ({ skipAuth: false, githubOAuth: false }));
            if (config.skipAuth) {
                this.host.inboxPullRequests = [];
                this.host.inboxGithubSignedIn = undefined;
                return;
            }
            if (repoKeys.length === 0) {
                this.host.inboxPullRequests = [];
                this.host.inboxGithubSignedIn = undefined;
                return;
            }
            const auth = await fetchQaapAuthSession();
            if (generation !== this.host.inboxLoadGeneration || abort.signal.aborted) {
                return;
            }
            if (!auth.signedIn) {
                if (readQaapSignedIn()) {
                    clearQaapAuthSession();
                }
                this.host.inboxGithubSignedIn = false;
                this.host.inboxPullRequests = [];
                return;
            }
            this.host.inboxGithubSignedIn = true;
            const response = await fetchQaapGithubPullRequests(repoKeys);
            if (generation !== this.host.inboxLoadGeneration || abort.signal.aborted) {
                return;
            }
            if (response.signedIn === false) {
                if (readQaapSignedIn()) {
                    clearQaapAuthSession();
                }
                this.host.inboxGithubSignedIn = false;
                this.host.inboxPullRequests = [];
                return;
            }
            this.host.inboxGithubSignedIn = true;
            this.host.inboxPullRequests = this.mergeInboxPullRequests(response.pullRequests);
        } catch {
            if (generation !== this.host.inboxLoadGeneration || abort.signal.aborted) {
                return;
            }
            this.host.inboxPullRequests = [];
        } finally {
            window.clearTimeout(timeout);
            if (this.host.inboxPullRequestsAbort === abort) {
                this.host.inboxPullRequestsAbort = undefined;
            }
            this.finishInboxPullRequestLoad(generation);
        }
    }
}
