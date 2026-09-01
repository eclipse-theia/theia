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

/** A file participating in a content hash; `relativePath` may use any separator. */
export interface FileContent {
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
 * Reproduces the registry's content hash byte-for-byte (registry `src/skill-source.ts`), which uses
 * one algorithm for both skill folders and Agent Plugin directories.
 */
export function computeContentHash(files: FileContent[]): string {
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
