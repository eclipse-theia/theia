// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

import { inject, injectable } from 'inversify';
import { environment } from '@theia/application-package/lib/environment';
import { OS, OSBackendProvider } from '../../common/os.js';
import { PreloadContribution } from './preloader.js';

@injectable()
export class OSPreloadContribution implements PreloadContribution {

    @inject(OSBackendProvider)
    protected readonly osBackendProvider: OSBackendProvider;

    async initialize(): Promise<void> {
        if (this.isBackendLocal()) {
            // `OS.backend` describes the frontend's OS by default, which is the backend's as well.
            return;
        }
        const osType = await this.osBackendProvider.getBackendOS();
        const isWindows = osType === 'Windows';
        const isOSX = osType === 'OSX';
        OS.backend.isOSX = isOSX;
        OS.backend.isWindows = isWindows;
        OS.backend.type = () => osType;
        OS.backend.EOL = isWindows ? '\r\n' : '\n';
    }

    /**
     * Whether the backend runs on the frontend's machine, so that the preload does not need to ask for its OS.
     * That is the case in an Electron window, unless it is connected to a remote backend, which its `localPort`
     * search parameter indicates.
     */
    protected isBackendLocal(): boolean {
        return environment.electron.is() && !new URL(location.href).searchParams.has('localPort');
    }

}
