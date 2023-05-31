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

export interface PackageJson {
    name: string
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    theiaReExports?: Record<string, ReExportJson>
}

/**
 * Raw re-export declaration as written in `package.json#theiaReExports[<destination>]`.
 */
export interface ReExportJson {
    'export *'?: string[]
    'export ='?: string[]
    copy?: string
}

/**
 * Examples:
 * - `a` => `['a']`
 * - `a/b/c/...` => `['a', 'b/c/...']`
 * - `@a/b` => `['@a/b']`
 * - `@a/b/c/...` => `['@a/b', 'c/...']`
 */
export function parseModule(moduleName: string): [string, string?] {
    const slice = moduleName.startsWith('@') ? 2 : 1;
    const split = moduleName.split('/').filter(part => part.trim().length > 0);
    if (split.length < slice) {
        throw new Error(`Unexpected module name/format: ${JSON.stringify(moduleName)}`);
    }
    const packageName = split.slice(0, slice).join('/');
    if (split.length === slice) {
        return [packageName];
    } else {
        const subModuleName = split.slice(slice).join('/');
        return [packageName, subModuleName];
    }
}
