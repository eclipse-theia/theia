// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import type { QaapProjectSessionSummary } from '@theia/qaap-adapters/lib/common/qaap-github-api-types';

const LOCAL_CACHE_KEY = 'qaap.mobileProjects.sessionCache.v1';

/** Browser-local mirror of hub session rows (merged with server on load). */
export function readLocalProjectSessions(): Map<string, QaapProjectSessionSummary> {
    const map = new Map<string, QaapProjectSessionSummary>();
    if (typeof localStorage === 'undefined') {
        return map;
    }
    try {
        const raw = localStorage.getItem(LOCAL_CACHE_KEY);
        if (!raw) {
            return map;
        }
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) {
            return map;
        }
        for (const row of parsed) {
            if (row && typeof row === 'object' && typeof (row as QaapProjectSessionSummary).repoKey === 'string') {
                const s = row as QaapProjectSessionSummary;
                map.set(s.repoKey, s);
            }
        }
    } catch {
        /* ignore corrupt cache */
    }
    return map;
}

export function writeLocalProjectSessions(map: Map<string, QaapProjectSessionSummary>): void {
    if (typeof localStorage === 'undefined') {
        return;
    }
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify([...map.values()]));
}

export function patchLocalProjectSession(patch: QaapProjectSessionSummary): void {
    const map = readLocalProjectSessions();
    const existing = map.get(patch.repoKey);
    map.set(patch.repoKey, {
        ...existing,
        ...patch,
        lastActiveAt: patch.lastActiveAt ?? new Date().toISOString(),
    });
    writeLocalProjectSessions(map);
}

export function mergeSessionMaps(
    ...sources: Array<Map<string, QaapProjectSessionSummary>>
): Map<string, QaapProjectSessionSummary> {
    const out = new Map<string, QaapProjectSessionSummary>();
    for (const source of sources) {
        for (const [key, value] of source.entries()) {
            const prev = out.get(key);
            out.set(key, prev ? { ...prev, ...value } : value);
        }
    }
    return out;
}
