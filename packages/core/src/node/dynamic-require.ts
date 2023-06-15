// *****************************************************************************
// Copyright (C) 2021 Ericsson and others.
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

declare const __non_webpack_require__: NodeJS.Require;

const nodeRequire = typeof __non_webpack_require__ !== 'undefined' ? __non_webpack_require__ : require;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dynamicRequire<T = any>(id: string): T {
    if (typeof id !== 'string') {
        throw new TypeError('module id must be a string');
    }
    if (id.startsWith('.')) {
        throw new Error(`module id cannot be a relative path, id: "${id}"`);
    }
    return nodeRequire(id);
}

/**
 * Remove all references to a module from Node's module cache.
 * @param filter callback to filter modules from the cache: return `true` to remove the module from the cache.
 */
export function removeFromCache(filter: (mod: NodeJS.Module) => boolean): void {
    Object.entries(nodeRequire.cache).forEach(([key, mod]) => {
        if (!mod || mod.id.endsWith('.node')) {
            return;
        }
        if (filter(mod)) {
            delete nodeRequire.cache[key];
            delete mod.exports;
            mod.children.length = 0;
            return;
        }
        mod.children.splice(0, mod.children.length, ...mod.children.filter(child => {
            if (filter(child)) {
                delete child.exports;
                child.children.length = 0;
                return false;
            }
            return true;
        }));
    });
}
