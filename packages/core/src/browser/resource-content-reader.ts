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

import { PLUGINS_BASE_PATH } from '../common/static-asset-paths';
import URI from '../common/uri';
import { Endpoint } from './endpoint';

/**
 * Minimal contract for reading text content by URI.
 * Implemented by e.g. FileService from @theia/filesystem.
 */
export interface TextContentReader {
    read(resource: URI): Promise<{ value: string }>;
}

/**
 * Reads text from a URI.
 * - For http(s):// URIs, fetches the URL and returns the response text.
 * - For paths under {@link PLUGINS_BASE_PATH} (e.g. hostedPlugin/pluginId/...) fetches from that path on the app origin.
 * - For file:// URIs uses the provided reader (e.g. FileService).
 */
export async function readResourceContent(uri: string | URI, fileReader?: TextContentReader): Promise<string> {
    let u = (typeof uri === 'string' ? new URI(uri) : uri).normalizePath();
    const pathStr = u.path.toString().replace(/^\//, '');

    // If path is under plugins base path, resolve it from current pathname
    if (pathStr.startsWith(PLUGINS_BASE_PATH + '/')) {
        const baseUrl = new Endpoint().getRestUrl();
        u = baseUrl.resolve(pathStr);
    }

    // Load from http(s)://
    if (u.scheme === 'http' || u.scheme === 'https') {
        const res = await fetch(u.toString());

        if (!res.ok) {
            throw new Error(`Failed to load resource: ${res.status} ${res.statusText}`);
        }

        return res.text();
    }

    // Read as file
    if (u.scheme === 'file' && fileReader) {
        const result = await fileReader.read(u);
        return result.value;
    }

    throw new Error(`Unsupported URI scheme: ${u.scheme}`);
}
