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
 * Resolution of the backend port in the Electron frontend.
 *
 * The main process loads the window content as soon as the window exists, while the backend is still
 * starting, so the URL it loads does not carry the port of the backend. The generated `index.js` resolves
 * the port from the main process before the preload phase makes the first connection and writes it into
 * the URL, where `Endpoint` and every other reader of `location.search` find it as before. A `port`
 * parameter that the URL carries already, as for a window that connects to a remote backend, is kept.
 */
export namespace ElectronBackendPort {

    export const PARAM = 'port';

    /**
     * Resolve the port from the main process unless the URL carries one, and put it into the URL.
     * Resolves once the backend is listening.
     */
    export async function resolve(): Promise<void> {
        const url = new URL(location.href);
        if (url.searchParams.has(PARAM)) {
            return;
        }
        const port = await window.electronTheiaCore.getBackendPort();
        url.searchParams.set(PARAM, port.toString());
        history.replaceState(history.state, '', url);
    }
}
