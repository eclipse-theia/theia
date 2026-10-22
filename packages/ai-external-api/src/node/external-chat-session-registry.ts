// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { ChatSessionStatus } from '@theia/ai-chat/lib/common/chat-model';
import { Emitter, Event, URI } from '@theia/core';
import { ILogger } from '@theia/core/lib/common/logger';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import {
    ExternalChatPrompt, ExternalChatPromptResult, ExternalChatSessionCreateRequest, ExternalChatSessionCreateResult,
    ExternalChatSessionDetail, ExternalChatSessionProvider, ExternalChatSessionSummary
} from '../common/external-chat-session-provider';

/**
 * Aggregates the {@link ExternalChatSessionProvider}s of all connected frontends.
 *
 * Providers register when a frontend connects and are removed when its connection closes.
 * Queries fan out to all providers; a failing or unresponsive provider is logged and skipped
 * so that a broken, busy, or disconnecting frontend does not break the external API. Sessions
 * reported by more than one provider (e.g. a session restored in several frontends) are
 * deduplicated, preferring restored over persisted-only, in-progress over finished, and more
 * recent over older reports. Session actions (open, restore) are routed to the preferred
 * provider in the same order.
 */
@injectable()
export class ExternalChatSessionRegistry {

    /**
     * Timeout in milliseconds after which an unresponsive provider is skipped in the query
     * fan-outs. Only the read-only queries are bounded: an action call may legitimately take
     * longer, and abandoning it could send it twice.
     */
    protected readonly queryTimeout = 10_000;

    @inject(ILogger) @named('ai-external-api:ExternalChatSessionRegistry')
    protected readonly logger: ILogger;

    protected readonly providers = new Set<ExternalChatSessionProvider>();

    protected readonly onDidChangeSessionsEmitter = new Emitter<void>();
    /** Fired when the set of connected frontends changes or a frontend reports a session change. */
    readonly onDidChangeSessions: Event<void> = this.onDidChangeSessionsEmitter.event;

    addProvider(provider: ExternalChatSessionProvider): void {
        this.providers.add(provider);
        this.notifySessionsChanged();
    }

    removeProvider(provider: ExternalChatSessionProvider): void {
        if (this.providers.delete(provider)) {
            this.notifySessionsChanged();
        }
    }

    /** Announces that the sessions visible through this registry changed, see {@link onDidChangeSessions}. */
    notifySessionsChanged(): void {
        this.onDidChangeSessionsEmitter.fire();
    }

    async getSessions(): Promise<ExternalChatSessionSummary[]> {
        const results = await this.queryProviders(provider => provider.getSessions());
        const merged = new Map<string, ExternalChatSessionSummary>();
        for (const summary of results.flat()) {
            const existing = merged.get(summary.id);
            if (!existing || this.prefer(summary, existing)) {
                merged.set(summary.id, summary);
            }
        }
        return Array.from(merged.values())
            .sort((a, b) => (b.lastInteraction ?? 0) - (a.lastInteraction ?? 0));
    }

    /**
     * Returns the detail of the session from the preferred frontend that knows it, or
     * `undefined` if no connected frontend knows it. The frontends are ranked by their session
     * summaries, so that only the preferred frontend has to report the conversation.
     */
    async getSession(sessionId: string): Promise<ExternalChatSessionDetail | undefined> {
        for (const provider of await this.getProvidersFor(sessionId)) {
            try {
                const session = await this.withQueryTimeout(provider.getSession(sessionId), 'get a session');
                if (session) {
                    return session;
                }
            } catch (error) {
                this.logger.warn('Failed to read a session from a frontend, trying the next one.', error);
            }
        }
        return undefined;
    }

    /**
     * Opens the session in the preferred frontend that knows it, restoring it if necessary.
     * Returns `false` if no connected frontend knows the session.
     */
    async openSession(sessionId: string): Promise<boolean> {
        for (const provider of await this.getProvidersFor(sessionId)) {
            try {
                if (await provider.openSession(sessionId)) {
                    return true;
                }
            } catch (error) {
                this.logger.warn('Failed to open a session in a frontend, trying the next one.', error);
            }
        }
        return false;
    }

    /**
     * Restores the session in the preferred frontend that knows it and returns its detail.
     * Returns `undefined` if no connected frontend knows the session.
     */
    async restoreSession(sessionId: string): Promise<ExternalChatSessionDetail | undefined> {
        for (const provider of await this.getProvidersFor(sessionId)) {
            try {
                const session = await provider.restoreSession(sessionId);
                if (session) {
                    return session;
                }
            } catch (error) {
                this.logger.warn('Failed to restore a session in a frontend, trying the next one.', error);
            }
        }
        return undefined;
    }

    /**
     * Sends the prompt to the given session in the preferred frontend that knows it.
     * The first definitive answer wins: in particular, a `busy` rejection by the preferred
     * frontend is not retried against less preferred copies of the session.
     * Returns `undefined` if no connected frontend knows the session.
     */
    async sendPrompt(sessionId: string, prompt: ExternalChatPrompt): Promise<ExternalChatPromptResult | undefined> {
        for (const provider of await this.getProvidersFor(sessionId)) {
            try {
                const result = await provider.sendPrompt(sessionId, prompt);
                if (result) {
                    return result;
                }
            } catch (error) {
                this.logger.warn('Failed to send a prompt to a frontend, trying the next one.', error);
            }
        }
        return undefined;
    }

    /**
     * Creates a session in a frontend matching the requested workspace. Without a requested
     * workspace, the session is created in the only connected frontend, and if the connected
     * frontends have different workspaces open, the request is rejected as ambiguous.
     * Rejected with `noFrontend` when no frontend is connected or none responds.
     */
    async createSession(request: ExternalChatSessionCreateRequest): Promise<ExternalChatSessionCreateResult> {
        if (this.providers.size === 0) {
            return { failure: 'noFrontend' };
        }
        const candidates = await this.getProvidersForWorkspace(request.workspace);
        if (candidates.length === 0) {
            return { failure: request.workspace ? 'workspaceNotFound' : 'noFrontend' };
        }
        if (!request.workspace && new Set(candidates.map(candidate => candidate.workspace)).size > 1) {
            return { failure: 'ambiguousWorkspace' };
        }
        for (const candidate of candidates) {
            try {
                return await candidate.provider.createSession(request);
            } catch (error) {
                this.logger.warn('Failed to create a session in a frontend, trying the next one.', error);
            }
        }
        throw new Error('All matching frontends failed to create the session.');
    }

    /** Returns the providers whose workspace matches the given one, or all providers if none is given. */
    protected async getProvidersForWorkspace(workspace: string | undefined): Promise<{ provider: ExternalChatSessionProvider; workspace?: string }[]> {
        const requested = workspace === undefined ? undefined : this.normalizeWorkspace(workspace);
        const candidates: { provider: ExternalChatSessionProvider; workspace?: string }[] = [];
        await Promise.all(Array.from(this.providers.values(), async provider => {
            try {
                const providerWorkspace = await this.withQueryTimeout(provider.getWorkspace(), 'query a workspace');
                const normalized = providerWorkspace === undefined ? undefined : this.normalizeWorkspace(providerWorkspace);
                if (requested === undefined || requested === normalized) {
                    candidates.push({ provider, workspace: normalized });
                }
            } catch (error) {
                this.logger.warn('Failed to query a frontend session provider, skipping it.', error);
            }
        }));
        return candidates;
    }

    /**
     * Normalizes a workspace URI for comparison: URIs that denote the same workspace but differ
     * in their path encoding or in a trailing separator normalize to the same string.
     */
    protected normalizeWorkspace(workspace: string): string {
        const uri = new URI(workspace).normalizePath();
        const path = uri.path.toString();
        return path.length > 1 && path.endsWith('/') ? uri.withPath(path.slice(0, -1)).toString() : uri.toString();
    }

    /** Returns the providers that know the given session, most preferred report first. */
    protected async getProvidersFor(sessionId: string): Promise<ExternalChatSessionProvider[]> {
        const candidates: { provider: ExternalChatSessionProvider; session: ExternalChatSessionSummary }[] = [];
        await Promise.all(Array.from(this.providers.values(), async provider => {
            try {
                const session = await this.withQueryTimeout(provider.getSessionSummary(sessionId), 'query a session summary');
                if (session) {
                    candidates.push({ provider, session });
                }
            } catch (error) {
                this.logger.warn('Failed to query a frontend session provider, skipping it.', error);
            }
        }));
        return candidates
            .sort((a, b) => this.prefer(a.session, b.session) ? -1 : this.prefer(b.session, a.session) ? 1 : 0)
            .map(candidate => candidate.provider);
    }

    protected async queryProviders<T>(query: (provider: ExternalChatSessionProvider) => Promise<T | undefined>): Promise<T[]> {
        const results: T[] = [];
        await Promise.all(Array.from(this.providers.values(), async provider => {
            try {
                const result = await this.withQueryTimeout(query(provider), 'query a frontend');
                if (result !== undefined) {
                    results.push(result);
                }
            } catch (error) {
                this.logger.warn('Failed to query a frontend session provider, skipping it.', error);
            }
        }));
        return results;
    }

    /**
     * Rejects when the query does not answer within {@link queryTimeout}. Theia's RPC has no
     * request timeout of its own, so an unresponsive frontend would otherwise stall the
     * external API request that fans out to it indefinitely.
     */
    protected withQueryTimeout<T>(query: Promise<T>, description: string): Promise<T> {
        let timer: NodeJS.Timeout | undefined;
        const timeout = new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`A frontend did not ${description} within ${this.queryTimeout} ms.`)), this.queryTimeout);
        });
        return Promise.race([query, timeout]).finally(() => clearTimeout(timer));
    }

    protected prefer(candidate: ExternalChatSessionSummary, existing: ExternalChatSessionSummary): boolean {
        if (candidate.restored !== existing.restored) {
            return candidate.restored;
        }
        const candidateInProgress = ChatSessionStatus.isInProgress(candidate.status);
        if (candidateInProgress !== ChatSessionStatus.isInProgress(existing.status)) {
            return candidateInProgress;
        }
        return (candidate.lastInteraction ?? 0) > (existing.lastInteraction ?? 0);
    }
}
