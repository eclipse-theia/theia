// *****************************************************************************
// Copyright (C) 2026 Eclipse Foundation and others.
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

// @ts-check

const fs = require('fs');
const path = require('path');

/**
 * @typedef FoundPackageJson
 * @property {string} __filename
 * @property {string} [name]
 * @property {{[package: string]: string}} [dependencies]
 */

/**
 * Cache the package.json of a given directory, as rules run for every linted file.
 * @type {Map<string, FoundPackageJson | undefined>}
 */
const readPackageJsonCache = new Map();

/**
 * Reads the package.json located directly in `directory`, without looking at parent directories.
 * @param {string} directory
 * @returns {FoundPackageJson | undefined} undefined if there is no readable package.json in `directory`.
 */
function readPackageJson(directory) {
    const resolved = path.resolve(directory);
    if (readPackageJsonCache.has(resolved)) {
        return readPackageJsonCache.get(resolved);
    }
    /** @type {FoundPackageJson | undefined} */
    let packageJson = undefined;
    const packageJsonPath = path.resolve(resolved, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf8' }));
            packageJson['__filename'] = packageJsonPath;
        } catch {
            packageJson = undefined;
        }
    }
    readPackageJsonCache.set(resolved, packageJson);
    return packageJson;
}

/**
 * Keep a shortcut to a given package.json file based on previous crawls.
 * @type {Map<string, FoundPackageJson>}
 */
const findPackageJsonCache = new Map();

/**
 * Finds the closest package.json by walking up from `from`.
 * @param {string} from file or directory path to start searching from.
 * @returns {FoundPackageJson | undefined}
 */
function findPackageJson(from) {
    const resolved = path.resolve(from);
    let current = fs.statSync(resolved).isDirectory() ? resolved : path.dirname(resolved);
    // Keep track of all paths tried before eventually finding a package.json file
    const tried = [current];
    while (true) {
        const cached = findPackageJsonCache.get(current);
        if (cached) {
            return cached;
        }
        const packageJson = readPackageJson(current);
        if (packageJson) {
            for (const dir of tried) {
                findPackageJsonCache.set(dir, packageJson);
            }
            return packageJson;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
        tried.push(current);
    }
}

module.exports = { findPackageJson, readPackageJson };
