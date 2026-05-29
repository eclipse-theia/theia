// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { Emitter, Event } from '@theia/core/lib/common/event';
import {
    QAAP_GITHUB_API_PATH,
    type QaapGithubInboxEvent,
    type QaapGithubPullRequestSummary,
} from '@theia/qaap-adapters/lib/common/qaap-github-api-types';

const INBOX_STREAM_URL = `${QAAP_GITHUB_API_PATH}/inbox/stream`;
const RECONNECT_DELAY_MS = 5_000;

async function inboxStreamEndpointAvailable(): Promise<boolean> {
    try {
        const response = await fetch(INBOX_STREAM_URL, { credentials: 'include' });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Live GitHub inbox feed (webhooks → SSE). The Work Hub inbox merges these events with
 * polled pull requests and agent conversations.
 */
@injectable()
export class MobileWorkHubInboxStream {

    protected source: EventSource | undefined;
    protected reconnectHandle: number | undefined;
    protected started = false;
    protected streamUnavailable = false;
    protected readonly pullByKey = new Map<string, QaapGithubPullRequestSummary>();

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;

    start(): void {
        if (this.started) {
            return;
        }
        this.started = true;
        this.openStream();
    }

    stop(): void {
        this.started = false;
        this.closeStream();
        this.pullByKey.clear();
    }

    /** Pull requests received via webhook since this session started (merged with poll results). */
    getLivePullRequests(): QaapGithubPullRequestSummary[] {
        return [...this.pullByKey.values()].sort(
            (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
        );
    }

    protected openStream(): void {
        this.closeStream();
        if (typeof EventSource === 'undefined' || this.streamUnavailable) {
            return;
        }
        try {
            const source = new EventSource(INBOX_STREAM_URL);
            this.source = source;
            source.addEventListener('pull_request', ev => {
                this.onPullRequestEvent(ev as MessageEvent<string>);
            });
            source.addEventListener('inbox_refresh', () => {
                this.onDidChangeEmitter.fire();
            });
            source.onerror = () => {
                this.closeStream();
                if (this.streamUnavailable || !this.started) {
                    return;
                }
                void inboxStreamEndpointAvailable().then(available => {
                    if (!available) {
                        this.streamUnavailable = true;
                        return;
                    }
                    if (this.started && !this.streamUnavailable) {
                        this.reconnectHandle = window.setTimeout(() => this.openStream(), RECONNECT_DELAY_MS);
                    }
                });
            };
        } catch {
            this.streamUnavailable = true;
        }
    }

    protected onPullRequestEvent(ev: MessageEvent<string>): void {
        try {
            const payload = JSON.parse(ev.data) as QaapGithubInboxEvent;
            if (payload.type !== 'pull_request') {
                return;
            }
            const key = `${payload.pullRequest.owner}/${payload.pullRequest.repo}#${payload.pullRequest.number}`;
            if (payload.action === 'closed') {
                this.pullByKey.delete(key);
            } else {
                this.pullByKey.set(key, payload.pullRequest);
            }
            this.onDidChangeEmitter.fire();
        } catch {
            /* ignore malformed events */
        }
    }

    protected closeStream(): void {
        if (this.reconnectHandle !== undefined) {
            window.clearTimeout(this.reconnectHandle);
            this.reconnectHandle = undefined;
        }
        if (this.source) {
            this.source.close();
            this.source = undefined;
        }
    }
}
