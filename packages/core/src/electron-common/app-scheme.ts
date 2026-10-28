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

/**
 * The privileged scheme through which the Electron frontend is loaded. Unlike a `file:` URL, a
 * privileged standard scheme lets Chromium keep a V8 code cache for the frontend's scripts across
 * launches, so that the entry bundle is not recompiled every time a window opens.
 */
export const APP_SCHEME = 'theia-app';
/** The single host under {@link APP_SCHEME}; paths are relative to the application's frontend directory. */
export const APP_HOST = 'theia';
/** The origin of the frontend's pages, as the renderer sends it in the `Origin` header. */
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

/** The URI of a file of the frontend directory under the application scheme. */
export function appUri(file: string): string {
    return `${APP_ORIGIN}/${file}`;
}

/** Whether `url` names the file `fileName` of the frontend directory under the application scheme. */
export function isAppFileUrl(url: string, fileName: string): boolean {
    try {
        const parsed = new URL(url);
        return parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST && parsed.pathname === `/${fileName}`;
    } catch {
        return false;
    }
}

/** A scheme to register as privileged with Electron's `protocol.registerSchemesAsPrivileged`. */
export interface PrivilegedScheme {
    scheme: string;
    privileges: {
        standard?: boolean;
        secure?: boolean;
        bypassCSP?: boolean;
        allowServiceWorkers?: boolean;
        supportFetchAPI?: boolean;
        corsEnabled?: boolean;
        stream?: boolean;
        codeCache?: boolean;
    };
}

/** The application scheme's registration: a standard, secure scheme with a V8 code cache. */
export function appSchemePrivileges(): PrivilegedScheme {
    return { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true } };
}
