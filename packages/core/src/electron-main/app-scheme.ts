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
import { promises as fs } from 'fs';

/**
 * The privileged scheme through which the Electron frontend is loaded. Unlike a `file:` URL, a
 * privileged standard scheme lets Chromium keep a V8 code cache for the frontend's scripts across
 * launches, so that the entry bundle is not recompiled every time a window opens.
 */
export const APP_SCHEME = 'theia-app';
/** The single host under {@link APP_SCHEME}; paths are relative to the application's frontend directory. */
export const APP_HOST = 'theia';

const CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.map': 'application/json',
    '.wasm': 'application/wasm',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
};

/** The URI of a file of the frontend directory under the application scheme. */
export function appUri(file: string): string {
    return `${APP_SCHEME}://${APP_HOST}/${file}`;
}

/** The content type served for a frontend file, by its extension. */
export function contentTypeOf(file: string): string {
    return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * The absolute path of the frontend file an application-scheme URL names, or `undefined` for a URL of
 * another scheme or host, or a path that would leave the frontend directory.
 */
export function resolveAppFile(url: string, frontendRoot: string): string | undefined {
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
    const root = path.resolve(frontendRoot);
    const file = path.normalize(path.join(root, pathname));
    return file.startsWith(root + path.sep) ? file : undefined;
}

/** Registers {@link APP_SCHEME} as a privileged standard scheme with a code cache. Must run before the app is ready. */
export function registerAppScheme(): void {
    const { protocol } = require('../../electron-shared/electron') as typeof import('../../electron-shared/electron');
    protocol.registerSchemesAsPrivileged([{
        scheme: APP_SCHEME,
        privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true }
    }]);
}

/** Serves the files of `frontendRoot` under {@link APP_SCHEME}. Must run once the app is ready. */
export function handleAppScheme(frontendRoot: string): void {
    const { protocol } = require('../../electron-shared/electron') as typeof import('../../electron-shared/electron');
    protocol.handle(APP_SCHEME, async request => {
        const file = resolveAppFile(request.url, frontendRoot);
        if (!file) {
            return new Response('Not found', { status: 404 });
        }
        try {
            const content = await fs.readFile(file);
            return new Response(content, { headers: { 'Content-Type': contentTypeOf(file) } });
        } catch {
            return new Response('Not found', { status: 404 });
        }
    });
}
