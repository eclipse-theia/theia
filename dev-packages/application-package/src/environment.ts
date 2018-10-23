/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

const isElectron: () => boolean = require('is-electron');

/**
 * The electron specific environment.
 */
class ElectronEnv {

    /**
     * Environment variable that can be accessed on the `process` to check if running in electron or not.
     */
    readonly THEIA_ELECTRON_VERSION = 'THEIA_ELECTRON_VERSION';

    /**
     * `true` if running in electron. Otherwise, `false`.
     *
     * Can be called from both the `main` and the render process. Also works for forked cluster workers.
     */
    is(): boolean {
        // When forking a new process from the cluster, we can rely neither on `process.versions` nor `process.argv`.
        // Se we look into the `process.env` as well. `is-electron` does not do it for us.
        return isElectron() || typeof process !== 'undefined' && typeof process.env === 'object' && !!process.env.THEIA_ELECTRON_VERSION;
    }

    /**
     * `true` if running in Electron in development mode. Otherwise, `false`.
     *
     * Cannot be used from the browser. From the browser, it is always `false`.
     */
    isDevMode(): boolean {
        return this.is()
            && typeof process !== 'undefined'
            // `defaultApp` does not exist on the Node.js API, but on electron (`electron.d.ts`).
            && ((process as any).defaultApp || /node_modules[/]electron[/]/.test(process.execPath)); // tslint:disable-line:no-any
    }

}

const electron = new ElectronEnv();
const environment: Readonly<{ electron: ElectronEnv }> = { electron };
export { environment };
