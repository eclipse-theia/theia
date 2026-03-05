// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import * as path from 'path';
import { stat } from 'fs/promises';

/**
 * Resolves a plugin file path (absolute or relative to plugin root) with fallback
 * to .js and .cjs extensions. Returns the resolved absolute path if a file exists,
 * otherwise undefined.
 */
export async function resolvePluginEntryFile(absolutePath: string): Promise<string | undefined> {
    const candidates = [absolutePath];
    const pathExtension = path.extname(absolutePath).toLowerCase();

    if (!pathExtension) {
        candidates.push(absolutePath + '.js');
        candidates.push(absolutePath + '.cjs');
        candidates.push(absolutePath + '.mjs');
    }

    for (const candidate of candidates) {
        try {
            const stats = await stat(candidate);
            if (stats.isFile()) {
                return candidate;
            }
        } catch {
            // File doesn't exist or is inaccessible - try next candidate
        }
    }
    return undefined;
}
