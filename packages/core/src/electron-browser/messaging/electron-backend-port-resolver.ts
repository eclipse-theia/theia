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

import { injectable } from 'inversify';
import { BACKEND_PORT_PARAM } from '../../electron-common/electron-api.js';

export const ElectronBackendPortResolver = Symbol('ElectronBackendPortResolver');

/**
 * Resolution of the backend port in the Electron frontend.
 *
 * The main process loads the window content as soon as the window exists, while the backend is still
 * starting, so the URL it loads does not carry the port of the backend. The generated `index.js` calls
 * {@link resolve} in the preload phase, once the `frontendPreload` modules are loaded and before the
 * `Preloader` makes the first connection, so that `Endpoint` and every other reader of `location.search`
 * find the port in the URL as before.
 */
export interface ElectronBackendPortResolver {
    /**
     * Put the port of the backend into the `port` parameter of the window URL, unless the URL carries one
     * already, as for a window that connects to a remote backend. Resolves once the backend is listening.
     */
    resolve(): Promise<void>;
}

@injectable()
export class ElectronBackendPortResolverImpl implements ElectronBackendPortResolver {

    async resolve(): Promise<void> {
        const url = new URL(location.href);
        if (url.searchParams.get(BACKEND_PORT_PARAM)) {
            return;
        }
        const port = await this.getBackendPort();
        url.searchParams.set(BACKEND_PORT_PARAM, port.toString());
        history.replaceState(history.state, '', url);
    }

    /**
     * The port of the local backend, from the main process. The preload script requests it when the window
     * starts loading, so that the request overlaps with loading the frontend.
     */
    protected getBackendPort(): Promise<number> {
        return window.electronTheiaCore.getBackendPort();
    }
}
