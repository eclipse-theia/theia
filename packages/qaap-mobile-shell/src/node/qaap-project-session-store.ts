// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { QaapProjectSessionSummary, QaapProjectSessionUpsertRequest } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';

const PERSIST_DEBOUNCE_MS = 100;
const STORE_FILE_MODE = 0o600;
const STORE_DIR_MODE = 0o700;

function resolveProjectSessionStorePath(): string {
    if (process.env.QAAP_PROJECT_SESSION_STORE_PATH?.trim()) {
        return process.env.QAAP_PROJECT_SESSION_STORE_PATH.trim();
    }
    const reposRoot = process.env.QAAP_REPOS_ROOT?.trim()
        || (process.env.NODE_ENV === 'production' ? '/workspace/repos' : path.join(os.homedir(), '.qaap', 'workspaces'));
    if (reposRoot.endsWith(`${path.sep}repos`)) {
        return path.join(path.dirname(reposRoot), '.qaap', 'project-sessions.json');
    }
    return path.join(os.homedir(), '.qaap', 'project-sessions.json');
}

/** Persisted per-user hub metrics keyed by `login` → repoKey → snapshot. */
interface PersistedProjectSessions {
    users: Array<[string, Array<[string, QaapProjectSessionSummary]>]>;
}

@injectable()
export class QaapProjectSessionStore {

    protected readonly byUser = new Map<string, Map<string, QaapProjectSessionSummary>>();
    protected readonly storePath = resolveProjectSessionStorePath();
    protected persistTimer: NodeJS.Timeout | undefined;
    protected loaded = false;

    @postConstruct()
    protected init(): void {
        this.loadFromDisk();
    }

    listForUser(login: string): QaapProjectSessionSummary[] {
        const map = this.byUser.get(login);
        return map ? [...map.values()] : [];
    }

    getForUser(login: string, repoKey: string): QaapProjectSessionSummary | undefined {
        return this.byUser.get(login)?.get(repoKey);
    }

    upsertForUser(login: string, patch: QaapProjectSessionUpsertRequest): QaapProjectSessionSummary {
        let map = this.byUser.get(login);
        if (!map) {
            map = new Map();
            this.byUser.set(login, map);
        }
        const existing = map.get(patch.repoKey);
        const next: QaapProjectSessionSummary = {
            repoKey: patch.repoKey,
            branch: patch.branch ?? existing?.branch ?? 'main',
            tokens: patch.tokens ?? existing?.tokens,
            cost: patch.cost ?? existing?.cost,
            agentState: patch.agentState ?? existing?.agentState,
            lastTask: patch.lastTask ?? existing?.lastTask,
            lastActiveAt: new Date().toISOString(),
            previewUrl: patch.previewUrl ?? existing?.previewUrl,
            bootstrapPhase: patch.bootstrapPhase ?? existing?.bootstrapPhase,
        };
        map.set(patch.repoKey, next);
        this.schedulePersist();
        return next;
    }

    protected loadFromDisk(): void {
        try {
            const raw = fs.readFileSync(this.storePath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<PersistedProjectSessions>;
            if (Array.isArray(parsed.users)) {
                for (const userEntry of parsed.users) {
                    if (!Array.isArray(userEntry) || userEntry.length !== 2 || typeof userEntry[0] !== 'string') {
                        continue;
                    }
                    const repos = new Map<string, QaapProjectSessionSummary>();
                    if (Array.isArray(userEntry[1])) {
                        for (const repoEntry of userEntry[1]) {
                            if (Array.isArray(repoEntry) && repoEntry.length === 2
                                && typeof repoEntry[0] === 'string'
                                && repoEntry[1]
                                && typeof repoEntry[1].repoKey === 'string') {
                                repos.set(repoEntry[0], repoEntry[1] as QaapProjectSessionSummary);
                            }
                        }
                    }
                    this.byUser.set(userEntry[0], repos);
                }
            }
        } catch (err) {
            const code = (err as NodeJS.ErrnoException).code;
            if (code !== 'ENOENT') {
                console.warn('[qaap] Could not read project session store:', err);
            }
        }
        this.loaded = true;
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
        this.persistTimer.unref?.();
    }

    protected persistNow(): void {
        const users: PersistedProjectSessions['users'] = [];
        for (const [login, repos] of this.byUser.entries()) {
            users.push([login, [...repos.entries()]]);
        }
        const dir = path.dirname(this.storePath);
        const tmpPath = `${this.storePath}.${process.pid}.tmp`;
        try {
            fs.mkdirSync(dir, { recursive: true, mode: STORE_DIR_MODE });
            fs.writeFileSync(tmpPath, JSON.stringify({ users }), { mode: STORE_FILE_MODE });
            fs.renameSync(tmpPath, this.storePath);
            try { fs.chmodSync(this.storePath, STORE_FILE_MODE); } catch { /* best-effort */ }
        } catch (err) {
            console.warn('[qaap] Could not persist project session store:', err);
            try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        }
    }
}
