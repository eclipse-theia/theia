// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { injectable } from '@theia/core/shared/inversify';
import type { QaapGithubInboxEvent, QaapGithubPullRequestSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';

/** In-memory fan-out for GitHub → Work Hub inbox live updates (SSE). */
@injectable()
export class QaapGithubInboxHub {

    protected readonly onDidChangeEmitter = new Emitter<QaapGithubInboxEvent>();
    readonly onDidChange: Event<QaapGithubInboxEvent> = this.onDidChangeEmitter.event;

    protected readonly pullByKey = new Map<string, QaapGithubPullRequestSummary>();

    publishPullRequest(
        action: string,
        pullRequest: QaapGithubPullRequestSummary,
        linkedConversationCount: number,
    ): void {
        const key = `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`;
        if (action === 'closed') {
            this.pullByKey.delete(key);
        } else {
            this.pullByKey.set(key, pullRequest);
        }
        this.onDidChangeEmitter.fire({
            type: 'pull_request',
            action,
            pullRequest,
            linkedConversationCount,
        });
    }

    publishRefresh(): void {
        this.onDidChangeEmitter.fire({ type: 'inbox_refresh' });
    }
}
