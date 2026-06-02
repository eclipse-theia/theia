// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** HTTP base path for the git review endpoints. */
export const QAAP_GIT_REVIEW_API_PATH = '/qaap/api/git-review';

/** A single file with working-tree changes. */
export interface QaapGitChangedFile {
    /** Repository-relative POSIX path. */
    path: string;
    /** Single-letter git status (M, A, D, R, U/?). */
    status: string;
    /** Added lines across the diff. */
    adds: number;
    /** Removed lines across the diff. */
    dels: number;
    /** True when the file's changes are fully staged (the mockup's "approved" state). */
    staged: boolean;
}

export interface QaapGitChangesResponse {
    /** Absolute fs path of the repository root that was inspected. */
    root: string;
    /** Current branch name (`git rev-parse --abbrev-ref HEAD`), when available. */
    branch?: string;
    files: QaapGitChangedFile[];
}

export type QaapGitHunkLineType = 'ctx' | 'add' | 'del';

export interface QaapGitHunkLine {
    type: QaapGitHunkLineType;
    /** Line number in the original file (undefined for added lines). */
    oldNumber?: number;
    /** Line number in the new file (undefined for removed lines). */
    newNumber?: number;
    text: string;
}

export interface QaapGitHunk {
    /** The raw `@@ ... @@` header. */
    header: string;
    lines: QaapGitHunkLine[];
}

export interface QaapGitFileDiffResponse {
    path: string;
    binary: boolean;
    hunks: QaapGitHunk[];
}

export interface QaapGitFileActionRequest {
    /** Absolute filesystem path of the repository root. */
    root: string;
    /** Repository-relative POSIX path. */
    file: string;
}

/** Parse the body of a `git diff` unified patch into structured hunks. */
export function parseUnifiedDiff(patch: string): QaapGitHunk[] {
    const hunks: QaapGitHunk[] = [];
    let current: QaapGitHunk | undefined;
    let oldNumber = 0;
    let newNumber = 0;
    for (const line of patch.split('\n')) {
        if (line.startsWith('@@')) {
            const match = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
            oldNumber = match ? Number(match[1]) : 0;
            newNumber = match ? Number(match[2]) : 0;
            current = { header: line, lines: [] };
            hunks.push(current);
            continue;
        }
        if (!current) {
            continue;
        }
        if (line.startsWith('+')) {
            current.lines.push({ type: 'add', newNumber: newNumber++, text: line.slice(1) });
        } else if (line.startsWith('-')) {
            current.lines.push({ type: 'del', oldNumber: oldNumber++, text: line.slice(1) });
        } else if (line.startsWith('\\')) {
            // "\ No newline at end of file" — skip.
        } else {
            current.lines.push({ type: 'ctx', oldNumber: oldNumber++, newNumber: newNumber++, text: line.slice(1) });
        }
    }
    return hunks;
}
