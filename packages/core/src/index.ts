/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

export * from './common';
export * from './electron-common';

export declare const browser: typeof import('./browser');
export declare const electronBrowser: typeof import('./electron-browser');
export declare const electronMain: typeof import('./electron-main');
export declare const electronNode: typeof import('./electron-node');
export declare const node: typeof import('./node');

const _cached: Record<string, unknown> = {};

Object.defineProperties(exports, {
    browser: {
        configurable: true,
        enumerable: true,
        writable: true,
        get: () => _cached.browser ??= require('./browser')
    },
    electronBrowser: {
        configurable: true,
        enumerable: true,
        writable: true,
        get: () => _cached.browser ??= require('./electron-browser')
    },
    electronMain: {
        configurable: true,
        enumerable: true,
        writable: true,
        get: () => _cached.browser ??= require('./electron-main')
    },
    electronNode: {
        configurable: true,
        enumerable: true,
        writable: true,
        get: () => _cached.browser ??= require('./electron-node')
    },
    node: {
        configurable: true,
        enumerable: true,
        writable: true,
        get: () => _cached.browser ??= require('./node')
    }
});
