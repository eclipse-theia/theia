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

const isElectronLib: () => boolean = require('is-electron');

/**
 * `true` if running in Electron. Otherwise, `false`. Can be called from both the `main` and the render process.
 */
export function isElectron(): boolean {
    return isElectronLib();
}

/**
 * `true` if running in Electron in development mode. Otherwise, `false`. Cannot be used from the browser.
 */
export function isElectronDevMode(): boolean {
    return isElectron()
        && typeof process !== 'undefined'
        // `defaultApp` does not exist on the Node.js API, but on electron (`electron.d.ts`).
        && ((process as any).defaultApp || /node_modules[/]electron[/]/.test(process.execPath)); // tslint:disable-line:no-any
}
