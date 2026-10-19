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

import { Endpoint } from '../browser/endpoint';

/**
 * Resolution of the backend port in the Electron frontend.
 *
 * The main process loads the window content as soon as the window exists, while the backend is still
 * starting, so the window URL does not carry the port of the backend. The generated `index.js` resolves
 * it from the main process before the preload phase makes the first connection. A `port` parameter in
 * the URL, as set for windows that connect to a remote backend, takes precedence.
 */
export namespace ElectronBackendPort {

    export const PARAM = 'port';

    /**
     * The port of the backend of this window, from the URL or as resolved from the main process.
     */
    export function get(): string {
        return new URLSearchParams(location.search).get(PARAM) ?? Endpoint.defaultPort;
    }

    /**
     * Resolve the port from the main process unless the URL carries one, and make it the default port
     * of every {@link Endpoint}. Resolves once the backend is listening.
     */
    export async function resolve(): Promise<void> {
        if (new URLSearchParams(location.search).has(PARAM)) {
            return;
        }
        const port = await window.electronTheiaCore.getBackendPort();
        Endpoint.defaultPort = port.toString();
    }
}
