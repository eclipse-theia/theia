// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core/lib/common/event';
import { injectable } from '@theia/core/shared/inversify';

const STORAGE_KEY = 'qaap.mobile.conversation-flags';
const READ_STORAGE_KEY = 'qaap.mobile.conversation-read';

export interface ConversationFlags {
    readonly priority?: boolean;
    readonly paused?: boolean;
}

export interface ConversationReadSnapshot {
    /** Greatest `updatedAt` value seen by the user on this conversation. */
    readonly lastSeenAt: number;
}

/**
 * Browser-local store for per-chat priority/pause overrides keyed by conversation id. Used for
 * Theia-chat sessions whose canonical state lives in the workspace metadata directory and doesn't
 * round-trip through the VPS conversation store — for qaap-agent conversations the server is the
 * source of truth, so callers should prefer the PATCH endpoint there.
 */
@injectable()
export class MobileProjectsConversationFlags {

    protected readonly cache = new Map<string, ConversationFlags>();
    protected readonly readCache = new Map<string, number>();
    protected loaded = false;
    protected readLoaded = false;

    protected readonly onDidChangeEmitter = new Emitter<string>();
    /** Fires the conversation id whose flags changed. */
    readonly onDidChange: Event<string> = this.onDidChangeEmitter.event;

    get(id: string): ConversationFlags {
        this.ensureLoaded();
        return this.cache.get(id) ?? {};
    }

    set(id: string, patch: ConversationFlags): ConversationFlags {
        this.ensureLoaded();
        const current = this.cache.get(id) ?? {};
        const next: ConversationFlags = {
            priority: patch.priority !== undefined ? patch.priority || undefined : current.priority,
            paused: patch.paused !== undefined ? patch.paused || undefined : current.paused,
        };
        if (!next.priority && !next.paused) {
            this.cache.delete(id);
        } else {
            this.cache.set(id, next);
        }
        this.persist();
        this.onDidChangeEmitter.fire(id);
        return next;
    }

    /** Greatest `updatedAt` the user has acknowledged for the conversation; 0 if never seen. */
    getLastSeen(id: string): number {
        this.ensureReadLoaded();
        return this.readCache.get(id) ?? 0;
    }

    /** Mark the conversation as read at the supplied timestamp (typically `summary.updatedAt`). */
    markRead(id: string, updatedAt: number): void {
        this.ensureReadLoaded();
        const current = this.readCache.get(id) ?? 0;
        if (updatedAt <= current) {
            return;
        }
        this.readCache.set(id, updatedAt);
        this.persistRead();
        this.onDidChangeEmitter.fire(id);
    }

    protected ensureLoaded(): void {
        if (this.loaded) {
            return;
        }
        this.loaded = true;
        try {
            const raw = window.localStorage?.getItem(STORAGE_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as Record<string, ConversationFlags>;
            for (const [id, flags] of Object.entries(parsed ?? {})) {
                if (flags && (flags.priority || flags.paused)) {
                    this.cache.set(id, { priority: flags.priority || undefined, paused: flags.paused || undefined });
                }
            }
        } catch {
            /* corrupted entry — start fresh */
        }
    }

    protected persist(): void {
        try {
            const out: Record<string, ConversationFlags> = {};
            for (const [id, flags] of this.cache) {
                out[id] = flags;
            }
            window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(out));
        } catch {
            /* persistence is best-effort — quota or private mode */
        }
    }

    protected ensureReadLoaded(): void {
        if (this.readLoaded) {
            return;
        }
        this.readLoaded = true;
        try {
            const raw = window.localStorage?.getItem(READ_STORAGE_KEY);
            if (!raw) {
                return;
            }
            const parsed = JSON.parse(raw) as Record<string, number>;
            for (const [id, ts] of Object.entries(parsed ?? {})) {
                if (typeof ts === 'number' && ts > 0) {
                    this.readCache.set(id, ts);
                }
            }
        } catch {
            /* corrupted entry — start fresh */
        }
    }

    protected persistRead(): void {
        try {
            const out: Record<string, number> = {};
            for (const [id, ts] of this.readCache) {
                out[id] = ts;
            }
            window.localStorage?.setItem(READ_STORAGE_KEY, JSON.stringify(out));
        } catch {
            /* persistence is best-effort */
        }
    }
}
