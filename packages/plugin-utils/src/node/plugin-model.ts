// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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

import { readdirSync } from 'fs';
import { toPluginUrl, type PluginIdentifierSource } from '../plugin-model';

export function getPluginRootFileUrl(manifest: PluginIdentifierSource & { packagePath: string }, names: string[]): string | undefined {
    const nameSet = new Set(names.map(n => n.toLowerCase()));
    try {
        const dir = readdirSync(manifest.packagePath, { withFileTypes: true });
        for (const dirent of dir) {
            if (dirent.isFile() && nameSet.has(dirent.name.toLowerCase())) {
                return toPluginUrl(manifest, dirent.name);
            }
        }
    } catch {
        return undefined;
    }
    return undefined;
}
