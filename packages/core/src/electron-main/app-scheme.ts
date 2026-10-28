// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { pathToFileURL } from 'url';
import { APP_HOST, APP_SCHEME, PrivilegedScheme } from '../electron-common/app-scheme';

export { APP_HOST, APP_ORIGIN, APP_SCHEME, appSchemePrivileges, appUri, isAppFileUrl, PrivilegedScheme } from '../electron-common/app-scheme';

/**
 * The absolute path of the frontend file an application-scheme URL names, or `undefined` for a URL of
 * another scheme or host, or a path that would leave the frontend directory. The URL parser removes
 * dot segments; the path check covers what it does not normalize, such as encoded separators.
 */
export function resolveAppFile(url: string, frontendRoot: string, pathModule: path.PlatformPath = path): string | undefined {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return undefined;
    }
    if (parsed.protocol !== `${APP_SCHEME}:` || parsed.host !== APP_HOST) {
        return undefined;
    }
    let pathname: string;
    try {
        pathname = decodeURIComponent(parsed.pathname);
    } catch {
        return undefined;
    }
    const root = pathModule.resolve(frontendRoot);
    const file = pathModule.normalize(pathModule.join(root, pathname));
    return file.startsWith(root + pathModule.sep) ? file : undefined;
}

/**
 * Registers the given schemes as privileged. Electron accepts this call only before the app is ready,
 * and only the last call counts, so the application makes it once with every scheme it needs.
 */
export function registerPrivilegedSchemes(schemes: PrivilegedScheme[]): void {
    const { app, protocol } = require('../../electron-shared/electron') as typeof import('../../electron-shared/electron');
    if (app.isReady()) {
        throw new Error('Privileged schemes must be registered before the app is ready.');
    }
    protocol.registerSchemesAsPrivileged(schemes);
}

/**
 * Serves the files of `frontendRoot` under {@link APP_SCHEME}, streamed by Electron's own file fetch,
 * which also answers range requests and sets the content type. Must run once the app is ready.
 */
export function handleAppScheme(frontendRoot: string): void {
    const { net, protocol } = require('../../electron-shared/electron') as typeof import('../../electron-shared/electron');
    protocol.handle(APP_SCHEME, async request => {
        const file = resolveAppFile(request.url, frontendRoot);
        if (!file) {
            return new Response('Not found', { status: 404 });
        }
        try {
            return await net.fetch(pathToFileURL(file).href, { method: request.method, headers: request.headers });
        } catch (error) {
            console.debug(`Could not serve ${request.url}:`, error);
            return new Response('Not found', { status: 404 });
        }
    });
}
