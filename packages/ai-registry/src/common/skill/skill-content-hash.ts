// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import { createHash } from 'crypto';

/**
 * A single file participating in the skill content hash, identified by its path relative
 * to the skill root (any path separator) and its raw bytes.
 */
export interface SkillFileContent {
    relativePath: string;
    content: Uint8Array;
}

/** Number of leading hex characters kept from the sha256 digest, matching the registry. */
const HASH_PREFIX_LENGTH = 12;

/** Normalises a relative path to POSIX separators so Windows backends match the Linux registry. */
function toPosix(relativePath: string): string {
    return relativePath.replace(/\\/g, '/');
}

/** True when any path segment is dot-prefixed; such files are excluded from the hash at every level. */
function hasDotSegment(posixPath: string): boolean {
    return posixPath.split('/').some(segment => segment.startsWith('.'));
}

/**
 * Reproduces the registry's skill content hash byte-for-byte (registry `src/skill-source.ts`):
 *
 * - Recursively considers all files, skipping any entry whose name starts with `.` at any
 *   directory level (this excludes the `.registry.json` registry metadata file automatically).
 * - Normalises relative paths to POSIX separators and sorts them lexicographically.
 * - For each file in order: `sha256.update(relativePath)` then `sha256.update(rawBytes)`.
 * - Returns the first {@link HASH_PREFIX_LENGTH} hex characters of the digest.
 */
export function computeSkillContentHash(files: SkillFileContent[]): string {
    const normalized = files
        .map(file => ({ relativePath: toPosix(file.relativePath), content: file.content }))
        .filter(file => !hasDotSegment(file.relativePath))
        .sort((a, b) => (a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0));
    const hash = createHash('sha256');
    for (const file of normalized) {
        hash.update(file.relativePath);
        hash.update(Buffer.from(file.content));
    }
    return hash.digest('hex').slice(0, HASH_PREFIX_LENGTH);
}
