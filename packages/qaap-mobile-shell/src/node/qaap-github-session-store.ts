// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { QaapAuthSessionUser } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';

export interface QaapGithubStoredSession {
    accessToken: string;
    user: QaapAuthSessionUser;
}

interface PersistedState {
    version: number;
    sessions: Array<[string, QaapGithubStoredSession]>;
    oauthStates: Array<[string, number]>;
}

const STORE_SCHEMA_VERSION = 1;
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;
const PERSIST_DEBOUNCE_MS = 100;
const STORE_FILE_MODE = 0o600;
const STORE_DIR_MODE = 0o700;
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = ['SIGINT', 'SIGTERM', 'SIGHUP'];

/** Docker/VPS: persist next to cloned repos on the mounted /workspace volume. */
export function resolveQaapAuthStorePath(): string {
    if (process.env.QAAP_AUTH_STORE_PATH?.trim()) {
        return process.env.QAAP_AUTH_STORE_PATH.trim();
    }
    const reposRoot = process.env.QAAP_REPOS_ROOT?.trim()
        || (process.env.NODE_ENV === 'production' ? '/workspace/repos' : path.join(os.homedir(), '.qaap', 'workspaces'));
    if (reposRoot.endsWith(`${path.sep}repos`)) {
        return path.join(path.dirname(reposRoot), '.qaap', 'auth', 'sessions.json');
    }
    return path.join(os.homedir(), '.qaap', 'auth', 'sessions.json');
}

/**
 * In-memory sessions + OAuth state map persisted to `~/.qaap/auth/sessions.json`.
 *
 * Persistence matters because the OAuth callback URL from GitHub can arrive
 * after the backend has restarted (very common during local dev). Without it,
 * either the OAuth `state` is rejected (state_lost) or the user appears
 * "signed out" right after the developer restarts `npm run start:browser`.
 */
@injectable()
export class QaapGithubSessionStore {

    protected readonly sessions = new Map<string, QaapGithubStoredSession>();
    protected readonly oauthStates = new Map<string, number>();
    protected readonly storePath: string = resolveQaapAuthStorePath();
    protected readonly backupPath: string = `${resolveQaapAuthStorePath()}.bak`;
    protected persistTimer: NodeJS.Timeout | undefined;
    protected loaded = false;
    protected shutdownHandlersInstalled = false;

    @postConstruct()
    protected init(): void {
        this.loadFromDisk();
        this.installShutdownHandlers();
    }

    createSession(data: QaapGithubStoredSession): string {
        const id = crypto.randomUUID();
        this.sessions.set(id, data);
        this.schedulePersist();
        return id;
    }

    getSession(sessionId: string | undefined): QaapGithubStoredSession | undefined {
        if (!sessionId) {
            return undefined;
        }
        return this.sessions.get(sessionId);
    }

    deleteSession(sessionId: string | undefined): void {
        if (sessionId && this.sessions.delete(sessionId)) {
            this.schedulePersist();
        }
    }

    createOAuthState(): string {
        const state = crypto.randomUUID();
        this.oauthStates.set(state, Date.now());
        this.pruneOAuthStates();
        this.schedulePersist();
        return state;
    }

    consumeOAuthState(state: string | undefined): boolean {
        if (!state || !this.oauthStates.has(state)) {
            return false;
        }
        this.oauthStates.delete(state);
        this.schedulePersist();
        return true;
    }

    protected pruneOAuthStates(): void {
        const now = Date.now();
        let removed = false;
        for (const [state, created] of this.oauthStates.entries()) {
            if (now - created > OAUTH_STATE_MAX_AGE_MS) {
                this.oauthStates.delete(state);
                removed = true;
            }
        }
        if (removed) {
            this.schedulePersist();
        }
    }

    protected loadFromDisk(): void {
        if (!this.tryLoadFile(this.storePath) && !this.tryLoadFile(this.backupPath)) {
            // Either no file exists yet, or both primary and backup are unreadable.
        }
        this.loaded = true;
    }

    protected tryLoadFile(filePath: string): boolean {
        let raw: string;
        try {
            raw = fs.readFileSync(filePath, 'utf8');
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') {
                console.warn(`[qaap-auth] Could not read session store at ${filePath}:`, err);
            }
            return false;
        }
        try {
            const parsed = JSON.parse(raw) as Partial<PersistedState>;
            // version is currently informational; future migrations can branch on it here.
            if (typeof parsed.version === 'number' && parsed.version > STORE_SCHEMA_VERSION) {
                console.warn(`[qaap-auth] Session store ${filePath} has newer schema v${parsed.version}; ignoring.`);
                return false;
            }
            if (Array.isArray(parsed.sessions)) {
                for (const entry of parsed.sessions) {
                    if (this.isValidSessionEntry(entry)) {
                        this.sessions.set(entry[0], entry[1]);
                    }
                }
            }
            if (Array.isArray(parsed.oauthStates)) {
                const now = Date.now();
                for (const entry of parsed.oauthStates) {
                    if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'number') {
                        if (now - entry[1] <= OAUTH_STATE_MAX_AGE_MS) {
                            this.oauthStates.set(entry[0], entry[1]);
                        }
                    }
                }
            }
            return true;
        } catch (err) {
            console.warn(`[qaap-auth] Session store ${filePath} is corrupt, trying fallback:`, err);
            return false;
        }
    }

    protected isValidSessionEntry(entry: unknown): entry is [string, QaapGithubStoredSession] {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') {
            return false;
        }
        const value = entry[1] as Partial<QaapGithubStoredSession> | undefined;
        return !!value
            && typeof value.accessToken === 'string'
            && !!value.user
            && typeof value.user.login === 'string';
    }

    protected schedulePersist(): void {
        if (!this.loaded) {
            return;
        }
        if (this.persistTimer !== undefined) {
            return;
        }
        this.persistTimer = setTimeout(() => {
            this.persistTimer = undefined;
            this.persistNow();
        }, PERSIST_DEBOUNCE_MS);
        // Allow Node to exit even if a flush is still scheduled.
        this.persistTimer.unref?.();
    }

    /**
     * Flush any pending debounced write immediately. Safe to call multiple times
     * and from shutdown signal handlers — used to guarantee that a session created
     * just before a VPS restart is not lost in the debounce window.
     */
    flushPendingPersist(): void {
        if (this.persistTimer !== undefined) {
            clearTimeout(this.persistTimer);
            this.persistTimer = undefined;
            this.persistNow();
        }
    }

    protected persistNow(): void {
        const payload: PersistedState = {
            version: STORE_SCHEMA_VERSION,
            sessions: [...this.sessions.entries()],
            oauthStates: [...this.oauthStates.entries()],
        };
        const dir = path.dirname(this.storePath);
        const tmpPath = `${this.storePath}.${process.pid}.tmp`;
        try {
            fs.mkdirSync(dir, { recursive: true, mode: STORE_DIR_MODE });
            // Write + fsync the data file before rename, so the rename can't
            // expose a zero-length file after a power loss.
            const fd = fs.openSync(tmpPath, 'w', STORE_FILE_MODE);
            try {
                fs.writeSync(fd, JSON.stringify(payload));
                try { fs.fsyncSync(fd); } catch { /* fsync may be unsupported on some filesystems */ }
            } finally {
                fs.closeSync(fd);
            }
            // Roll the previous good copy to .bak so a corrupt write still has a fallback.
            try {
                if (fs.existsSync(this.storePath)) {
                    fs.copyFileSync(this.storePath, this.backupPath);
                    try { fs.chmodSync(this.backupPath, STORE_FILE_MODE); } catch { /* best-effort */ }
                }
            } catch (err) {
                console.warn('[qaap-auth] Could not refresh session store backup:', err);
            }
            fs.renameSync(tmpPath, this.storePath);
            // Tighten perms in case mkdir/write honored umask instead of mode.
            try { fs.chmodSync(this.storePath, STORE_FILE_MODE); } catch { /* best-effort */ }
            // fsync the parent dir so the rename itself survives a crash.
            try {
                const dirFd = fs.openSync(dir, 'r');
                try { fs.fsyncSync(dirFd); } catch { /* not supported everywhere */ }
                fs.closeSync(dirFd);
            } catch { /* best-effort */ }
        } catch (err) {
            console.warn('[qaap-auth] Could not persist session store:', err);
            try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
    }

    protected installShutdownHandlers(): void {
        if (this.shutdownHandlersInstalled) {
            return;
        }
        this.shutdownHandlersInstalled = true;
        const flush = (): void => {
            try {
                this.flushPendingPersist();
            } catch (err) {
                console.warn('[qaap-auth] Error flushing session store on shutdown:', err);
            }
        };
        process.on('beforeExit', flush);
        process.on('exit', flush);
        for (const signal of SHUTDOWN_SIGNALS) {
            process.on(signal, () => {
                flush();
                // Do not exit here — other shutdown logic may still need to run.
                // If we are the only handler, Node will exit normally after this tick.
            });
        }
    }
}
