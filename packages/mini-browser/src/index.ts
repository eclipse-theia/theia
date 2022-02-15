/********************************************************************************
* Copyright (C) 2022 Ericsson(autogen) and others.
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

export declare const browser: typeof import('./browser');
export declare const electronBrowser: typeof import('./electron-browser');
export declare const electronMain: typeof import('./electron-main');
export declare const node: typeof import('./node');
function _lazyProperty(get: () => unknown): PropertyDescriptor {
    return {
        configurable: true,
        enumerable: true,
        writable: true,
        get
    };
}
Object.defineProperties(exports, {
    browser: _lazyProperty(() => require('./browser')),
    electronBrowser: _lazyProperty(() => require('./electron-browser')),
    electronMain: _lazyProperty(() => require('./electron-main')),
    node: _lazyProperty(() => require('./node')),
});
