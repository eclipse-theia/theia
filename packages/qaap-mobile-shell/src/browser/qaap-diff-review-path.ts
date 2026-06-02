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

/** Middle-ellipsis truncation for narrow diff headers (Cursor-style). */
export function middleTruncatePath(path: string, maxLength = 52): string {
    if (path.length <= maxLength) {
        return path;
    }
    const keep = Math.max(8, Math.floor((maxLength - 1) / 2));
    return `${path.slice(0, keep)}…${path.slice(-keep)}`;
}
