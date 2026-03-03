// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin.
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

import { PLUGINS_BASE_PATH, PLUGIN_RESOURCE_SCHEME } from '@theia/core/lib/common/static-asset-paths';
import URI from '@theia/core/lib/common/uri';
import { FileService } from './file-service';

function normalizeUri(uri: string | URI): URI {
    const u = typeof uri === 'string' ? new URI(uri) : uri;
    return u.normalizePath();
}

/**
 * Reads text from a URI. For {@link PLUGIN_RESOURCE_SCHEME} (theia-plugin:/pluginId/...)
 * fetches from the app origin at hostedPlugin/pluginId/.... Otherwise uses {@link FileService.read}.
 */
export async function readResourceContent(uri: string | URI, fileService: FileService): Promise<string> {
    const u = normalizeUri(uri);

    if (u.scheme === PLUGIN_RESOURCE_SCHEME) {
        const path = u.path.toString().replace(/^\//, '');
        const fetchPath = `${PLUGINS_BASE_PATH}/${path}`;
        const url = (typeof window !== 'undefined' && window.location?.origin)
            ? new URL(fetchPath, window.location.origin + '/').toString()
            : './' + fetchPath;
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to load resource: ${res.status} ${res.statusText}`);
        }
        return res.text();
    }
    const result = await fileService.read(u);
    return result.value;
}
