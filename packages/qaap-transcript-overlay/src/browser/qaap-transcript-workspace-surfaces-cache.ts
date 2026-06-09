// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { normalizeTranscriptWorkspacePath } from '../common/qaap-transcript-workspace-path';
import type { TranscriptFilesMount, TranscriptTerminalSurface } from './qaap-transcript-surface-types';

/** Normalized workspace root path — one cache entry per project workspace, not per task. */
export type TranscriptWorkspaceSurfaceKey = string;

const MAX_CACHED_WORKSPACES = 4;

export function normalizeTranscriptWorkspaceKey(resolvedPath: string): TranscriptWorkspaceSurfaceKey {
    const trimmed = resolvedPath.trim();
    if (!trimmed) {
        return trimmed;
    }
    return normalizeTranscriptWorkspacePath(trimmed);
}

/**
 * Reuses transcript Files tree and Terminal per workspace (project cwd), not per conversation/task.
 * LRU eviction disposes PTYs and DOM when more than {@link MAX_CACHED_WORKSPACES} workspaces are cached.
 */
export class TranscriptWorkspaceSurfacesCache {
    protected readonly filesByKey = new Map<TranscriptWorkspaceSurfaceKey, TranscriptFilesMount>();
    protected readonly terminalsByKey = new Map<TranscriptWorkspaceSurfaceKey, TranscriptTerminalSurface>();
    protected readonly terminalPending = new Map<TranscriptWorkspaceSurfaceKey, Promise<TranscriptTerminalSurface>>();
    protected readonly lru: TranscriptWorkspaceSurfaceKey[] = [];

    peekFiles(key: TranscriptWorkspaceSurfaceKey): TranscriptFilesMount | undefined {
        return this.filesByKey.get(key);
    }

    setFiles(key: TranscriptWorkspaceSurfaceKey, mount: TranscriptFilesMount): void {
        this.filesByKey.set(key, mount);
        this.touch(key);
    }

    getTerminal(key: TranscriptWorkspaceSurfaceKey): TranscriptTerminalSurface | undefined {
        const surface = this.terminalsByKey.get(key);
        if (surface && surface.terminal.isDisposed) {
            this.terminalsByKey.delete(key);
            return undefined;
        }
        return surface;
    }

    acquireTerminal(
        key: TranscriptWorkspaceSurfaceKey,
        factory: () => Promise<TranscriptTerminalSurface>,
    ): Promise<TranscriptTerminalSurface> {
        const existing = this.getTerminal(key);
        if (existing) {
            this.touch(key);
            return Promise.resolve(existing);
        }
        const pending = this.terminalPending.get(key);
        if (pending) {
            return pending;
        }
        const created = factory().then(surface => {
            this.terminalsByKey.set(key, surface);
            this.terminalPending.delete(key);
            this.touch(key);
            return surface;
        }).catch(error => {
            this.terminalPending.delete(key);
            throw error;
        });
        this.terminalPending.set(key, created);
        return created;
    }

    evict(key: TranscriptWorkspaceSurfaceKey): void {
        const files = this.filesByKey.get(key);
        files?.dispose.dispose();
        this.filesByKey.delete(key);
        const terminal = this.terminalsByKey.get(key);
        if (terminal) {
            terminal.dispose.dispose();
            this.terminalsByKey.delete(key);
        }
        this.terminalPending.delete(key);
        const index = this.lru.indexOf(key);
        if (index >= 0) {
            this.lru.splice(index, 1);
        }
    }

    disposeAll(): void {
        for (const key of [...this.filesByKey.keys(), ...this.terminalsByKey.keys()]) {
            this.evict(key);
        }
        this.lru.length = 0;
        this.terminalPending.clear();
    }

    protected touch(key: TranscriptWorkspaceSurfaceKey): void {
        const index = this.lru.indexOf(key);
        if (index >= 0) {
            this.lru.splice(index, 1);
        }
        this.lru.push(key);
        while (this.lru.length > MAX_CACHED_WORKSPACES) {
            const oldest = this.lru.shift();
            if (oldest) {
                this.evict(oldest);
            }
        }
    }
}
