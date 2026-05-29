// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Splits a repository-relative path into directory and basename for compact diff UI. */
export function splitRepoRelativePath(path: string): { base: string; dir: string } {
    const normalized = path.replace(/\\/g, '/');
    const slash = normalized.lastIndexOf('/');
    if (slash < 0) {
        return { base: normalized, dir: '' };
    }
    return { base: normalized.slice(slash + 1), dir: normalized.slice(0, slash) };
}
