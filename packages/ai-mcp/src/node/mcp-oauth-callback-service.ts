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

import { nls } from '@theia/core/lib/common/nls';
import { injectable } from '@theia/core/shared/inversify';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MCPOAuthCallback } from '../common/mcp-oauth';
import { randomUUID } from 'crypto';

/**
 * Maximum time the backend will wait for an OAuth authorization callback after creating a `state`.
 * Bounds memory held by abandoned flows and rejects truly stale callbacks. Five minutes accommodates
 * slow authorization servers and users briefly tabbing away without parking entries indefinitely.
 */
export const MCP_OAUTH_CALLBACK_TIMEOUT = 5 * 60 * 1000;

/**
 * Defensive cap on remembered rejection messages (see {@link MCPOAuthCallbackService.rejectedCallbacks}).
 * Sized well above any realistic single-user burst (e.g. workspace-trust toggle with all OAuth
 * servers autostarting); hitting it only degrades a late browser callback's message to the generic
 * "Unknown or expired OAuth state". Shared across frontends; multi-tenant deployments should run
 * one backend per user.
 */
export const MCP_OAUTH_REJECTED_CALLBACK_LIMIT = 32;

/**
 * Defensive cap on concurrent in-flight OAuth authorizations. Sized well above any realistic
 * single-user burst; hitting it cancels the oldest unsettled authorization, which is destructive,
 * so the cap deliberately leaves headroom over typical and pathological-but-legitimate scenarios.
 * Shared across frontends; multi-tenant deployments should run one backend per user.
 */
export const MCP_OAUTH_ACTIVE_CALLBACK_LIMIT = 32;

/**
 * Plain-literal export so tests can match the cancelled-error message without depending on nls.
 */
export const MCP_OAUTH_AUTHORIZATION_CANCELLED = 'MCP OAuth authorization was cancelled.';

export class MCPOAuthCancelledError extends Error {
    constructor() {
        super(nls.localize('theia/ai/mcp/oauth/authorizationCancelled', MCP_OAUTH_AUTHORIZATION_CANCELLED));
        this.name = 'MCPOAuthCancelledError';
    }
}

interface CallbackEntry {
    deferred: Deferred<MCPOAuthCallback>;
    /** Set true once waitForCallback returns the promise to a consumer. */
    claimed: boolean;
    /** Set true once acceptCallback / cancel / timer settle the deferred. */
    settled: boolean;
}

@injectable()
export class MCPOAuthCallbackService {

    protected readonly callbacks = new Map<string, CallbackEntry>();
    protected readonly timers = new Map<string, NodeJS.Timeout>();

    /**
     * Recently-rejected OAuth `state` values mapped to a user-facing message. Bridges the gap
     * between in-process cancellation/timeout and the user's browser, which may still have the
     * OAuth tab open and arrive at the callback path seconds later; without this cache the late
     * callback would render a generic "Unknown or expired OAuth state" message instead of the
     * real reason the flow ended.
     *
     * Each entry has a TTL of {@link MCP_OAUTH_CALLBACK_TIMEOUT} via {@link rejectedTimers}. The
     * additional FIFO cap (by Map insertion order, bounded by {@link MCP_OAUTH_REJECTED_CALLBACK_LIMIT})
     * is a backstop in case a burst of cancellations outpaces those timers. FIFO is preferred over
     * LRU because each entry is consumed at most once and recency of insertion is what predicts
     * whether a browser callback will still arrive.
     */
    protected readonly rejectedCallbacks = new Map<string, string>();
    protected readonly rejectedTimers = new Map<string, NodeJS.Timeout>();

    createState(): string {
        const state = randomUUID();
        // Reserve up front so a callback racing ahead of waitForCallback is queued instead of rejected as 'unknown state'.
        this.reserveCallback(state);
        return state;
    }

    waitForCallback(state: string): Promise<MCPOAuthCallback> {
        const existing = this.callbacks.get(state);
        if (existing) {
            existing.claimed = true;
            // Race case: the callback arrived before any consumer attached; safe to drop the entry now.
            if (existing.settled) {
                this.callbacks.delete(state);
            }
            return existing.deferred.promise;
        }
        if (this.rejectedCallbacks.has(state)) {
            return Promise.reject(new MCPOAuthCancelledError());
        }
        const entry = this.reserveCallback(state);
        entry.claimed = true;
        return entry.deferred.promise;
    }

    protected reserveCallback(state: string, timeout = MCP_OAUTH_CALLBACK_TIMEOUT): CallbackEntry {
        if (this.callbacks.has(state)) {
            this.cancel(state);
        }
        this.evictOldestCallbackIfNeeded();
        const deferred = new Deferred<MCPOAuthCallback>();
        // Suppress unhandled-rejection warnings if no consumer ever attaches.
        deferred.promise.catch(() => undefined);
        const entry: CallbackEntry = { deferred, claimed: false, settled: false };
        const timer = setTimeout(() => {
            const tracked = this.callbacks.get(state);
            if (tracked === entry && !entry.settled) {
                entry.settled = true;
                this.callbacks.delete(state);
                this.timers.delete(state);
                this.rememberRejectedCallback(state,
                    nls.localize('theia/ai/mcp/oauth/authorizationTimedOut', 'OAuth authorization timed out. Please start sign-in again.'));
                deferred.reject(new Error('Timed out waiting for MCP OAuth authorization callback.'));
            }
        }, timeout);
        this.callbacks.set(state, entry);
        this.timers.set(state, timer);
        return entry;
    }

    protected evictOldestCallbackIfNeeded(): void {
        while (this.callbacks.size >= MCP_OAUTH_ACTIVE_CALLBACK_LIMIT) {
            // Prefer evicting the oldest UNSETTLED entry; a settled-but-unclaimed entry holds a real resolved result.
            let victimState: string | undefined;
            for (const [state, entry] of this.callbacks) {
                if (!entry.settled) {
                    victimState = state;
                    break;
                }
            }
            if (!victimState) {
                victimState = this.callbacks.keys().next().value;
            }
            if (!victimState) {
                break;
            }
            console.warn(
                'Evicting oldest MCP OAuth active callback state because the process-global limit of '
                + `${MCP_OAUTH_ACTIVE_CALLBACK_LIMIT} concurrent authorizations was reached.`
            );
            this.cancel(victimState, nls.localize('theia/ai/mcp/oauth/authorizationEvicted',
                'OAuth authorization was cancelled because too many authorization attempts are in progress.'));
        }
    }

    acceptCallback(callback: MCPOAuthCallback): boolean {
        const entry = this.callbacks.get(callback.state);
        if (!entry || entry.settled) {
            return false;
        }
        entry.settled = true;
        const timer = this.timers.get(callback.state);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(callback.state);
        }
        // Only drop the entry if a consumer is attached; otherwise keep it for the race-case waitForCallback.
        if (entry.claimed) {
            this.callbacks.delete(callback.state);
        }
        entry.deferred.resolve(callback);
        return true;
    }

    consumeRejectedCallbackMessage(state: string): string | undefined {
        const message = this.rejectedCallbacks.get(state);
        if (message) {
            this.rejectedCallbacks.delete(state);
            const timer = this.rejectedTimers.get(state);
            if (timer) {
                clearTimeout(timer);
                this.rejectedTimers.delete(state);
            }
        }
        return message;
    }

    cancel(state: string, message = nls.localize('theia/ai/mcp/oauth/authorizationCancelledCloseTab', 'OAuth authorization was cancelled. You can close this tab.')): void {
        const entry = this.callbacks.get(state);
        if (!entry) {
            return;
        }
        const wasSettled = entry.settled;
        entry.settled = true;
        this.callbacks.delete(state);
        const timer = this.timers.get(state);
        if (timer) {
            clearTimeout(timer);
            this.timers.delete(state);
        }
        if (!wasSettled) {
            entry.deferred.reject(new MCPOAuthCancelledError());
        }
        // Record the cancellation message so a late browser callback can render it.
        this.rememberRejectedCallback(state, message);
    }

    protected rememberRejectedCallback(state: string, message: string): void {
        const previousTimer = this.rejectedTimers.get(state);
        if (previousTimer) {
            clearTimeout(previousTimer);
        }
        // FIFO eviction by Map insertion order.
        while (this.rejectedCallbacks.size >= MCP_OAUTH_REJECTED_CALLBACK_LIMIT) {
            const oldestState = this.rejectedCallbacks.keys().next().value;
            if (!oldestState) {
                break;
            }
            this.rejectedCallbacks.delete(oldestState);
            const oldestTimer = this.rejectedTimers.get(oldestState);
            if (oldestTimer) {
                clearTimeout(oldestTimer);
                this.rejectedTimers.delete(oldestState);
            }
        }
        this.rejectedCallbacks.set(state, message);
        this.rejectedTimers.set(state, setTimeout(() => {
            this.rejectedCallbacks.delete(state);
            this.rejectedTimers.delete(state);
        }, MCP_OAUTH_CALLBACK_TIMEOUT));
    }
}
