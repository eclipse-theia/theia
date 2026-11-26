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

import fs = require('fs');
import path = require('path');

export interface PackageJson {
    name: string
    type?: string
    exports?: unknown
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

function findPackageRootInNodeModules(packageName: string, fromDir: string): string | undefined {
    let dir = path.resolve(fromDir);
    while (true) {
        const candidate = path.join(dir, 'node_modules', packageName);
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
            return candidate;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            return undefined;
        }
        dir = parent;
    }
}

function resolveExportsEntry(exportsField: unknown, subModuleName?: string): unknown {
    if (!exportsField || typeof exportsField !== 'object') {
        return exportsField;
    }
    const record = exportsField as Record<string, unknown>;
    const keys = Object.keys(record);
    const isSubpathMap = keys.some(key => key.startsWith('.'));
    if (!isSubpathMap) {
        return subModuleName ? undefined : record;
    }
    const target = subModuleName ? `./${subModuleName}` : '.';
    if (target in record) {
        return record[target];
    }
    for (const key of keys) {
        if (key.includes('*')) {
            const [prefix, suffix] = key.split('*', 2);
            if (target.startsWith(prefix) && target.endsWith(suffix)) {
                return record[key];
            }
        }
    }
    return undefined;
}

function hasCondition(entry: unknown, condition: string): boolean {
    if (!entry || typeof entry !== 'object') {
        return false;
    }
    const record = entry as Record<string, unknown>;
    if (condition in record) {
        return true;
    }
    return Object.values(record).some(value => hasCondition(value, condition));
}

function findPackageRootFromResolved(resolved: string, packageName: string): string | undefined {
    let current = path.dirname(resolved);
    while (!fs.existsSync(path.join(current, 'package.json'))
        || JSON.parse(fs.readFileSync(path.join(current, 'package.json'), 'utf8')).name !== packageName) {
        const parent = path.dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }
    return current;
}

interface ResolvedPackageInfo {
    resolved?: string
    packageRoot?: string
    packageJson?: PackageJson
    subModuleName?: string
    exportsEntry?: unknown
}

function resolvePackageInfo(moduleName: string, fromDir: string): ResolvedPackageInfo {
    const [packageName, subModuleName] = parseModule(moduleName);
    let resolved: string | undefined;
    try {
        resolved = require.resolve(moduleName, { paths: [fromDir] });
    } catch {
        resolved = undefined;
    }
    const packageRoot = resolved
        ? findPackageRootFromResolved(resolved, packageName)
        : findPackageRootInNodeModules(packageName, fromDir);
    const packageJson = packageRoot
        ? JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as PackageJson
        : undefined;
    const exportsEntry = packageJson ? resolveExportsEntry(packageJson.exports, subModuleName) : undefined;
    return { resolved, packageRoot, packageJson, subModuleName, exportsEntry };
}

/**
 * Determines whether `moduleName` is loaded as a CommonJS module when imported from an ES module in `fromDir`.
 */
export function isCommonJsModule(moduleName: string, fromDir: string): boolean {
    const { resolved, packageJson, exportsEntry } = resolvePackageInfo(moduleName, fromDir);
    if (!resolved) {
        return false;
    }
    // A dual package provides a separate entry point for the `import` condition, which is an ES module.
    if (hasCondition(exportsEntry, 'import')) {
        return false;
    }
    if (resolved.endsWith('.cjs')) {
        return true;
    }
    if (resolved.endsWith('.mjs')) {
        return false;
    }
    if (!packageJson) {
        return true;
    }
    return packageJson.type !== 'module';
}

/**
 * Determines whether `moduleName` resolved from `fromDir` is an ESM-only module
 * (i.e. ships only ES modules without a CommonJS / `require` entry point).
 */
export function isEsmOnlyModule(moduleName: string, fromDir: string): boolean {
    const { resolved, packageRoot, packageJson, subModuleName, exportsEntry } = resolvePackageInfo(moduleName, fromDir);
    if (resolved) {
        if (resolved.endsWith('.cjs')) {
            return false;
        }
        if (!packageJson) {
            return resolved.endsWith('.mjs');
        }
        if (hasCondition(exportsEntry, 'require')) {
            return false;
        }
        if (resolved.endsWith('.mjs')) {
            return true;
        }
        return packageJson.type === 'module';
    }
    // `require.resolve` can fail when a package only declares an `import` export condition, or when
    // a copied re-export stub was just switched from `index.cjs` to `index.js` before `exports` was updated.
    if (!packageRoot || !packageJson) {
        return false;
    }
    if (subModuleName) {
        const subDir = path.join(packageRoot, subModuleName);
        if (fs.existsSync(path.join(subDir, 'index.js')) && !fs.existsSync(path.join(subDir, 'index.cjs'))) {
            return packageJson.type === 'module';
        }
    }
    if (hasCondition(exportsEntry, 'require')) {
        return false;
    }
    if (hasCondition(exportsEntry, 'import')) {
        return true;
    }
    return packageJson.type === 'module';
}
