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
 * Thrown when a package.json exists but cannot be read or parsed.
 */
class MalformedPackageJsonError extends Error {
    /**
     * @param {string} packageJsonPath
     * @param {unknown} cause
     */
    constructor(packageJsonPath, cause) {
        super(`Cannot read "${packageJsonPath}": ${cause instanceof Error ? cause.message : String(cause)}`);
        this.packageJsonPath = packageJsonPath;
    }
}

/**
 * Cache the package.json of a given directory, as rules run for every linted file. A
 * `MalformedPackageJsonError` is cached as well so that a broken file is only read once.
 * @type {Map<string, FoundPackageJson | MalformedPackageJsonError | undefined>}
 */
const readPackageJsonCache = new Map();

/**
 * Reads the package.json located directly in `directory`, without looking at parent directories.
 * @param {string} directory
 * @returns {FoundPackageJson | undefined} undefined if there is no package.json in `directory`.
 * @throws {MalformedPackageJsonError} if there is one but it cannot be read or parsed.
 */
function readPackageJson(directory) {
    const resolved = path.resolve(directory);
    if (readPackageJsonCache.has(resolved)) {
        const cached = readPackageJsonCache.get(resolved);
        if (cached instanceof MalformedPackageJsonError) {
            throw cached;
        }
        return cached;
    }
    /** @type {FoundPackageJson | undefined} */
    let packageJson = undefined;
    const packageJsonPath = path.resolve(resolved, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
        try {
            packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf8' }));
            packageJson['__filename'] = packageJsonPath;
        } catch (error) {
            const malformed = new MalformedPackageJsonError(packageJsonPath, error);
            readPackageJsonCache.set(resolved, malformed);
            throw malformed;
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
 * @throws {MalformedPackageJsonError} if a package.json on the way up cannot be read or parsed.
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

/**
 * package.json files already reported, as the same broken file would otherwise be reported again
 * for every linted file of the package.
 * @type {Set<string>}
 */
const reportedPackageJsonPaths = new Set();

/**
 * Runs `lookup` and turns a malformed package.json into a problem on the file currently being
 * linted, rather than letting it escape as an exception, which would abort the whole ESLint run.
 * A given package.json is reported by the first rule that trips over it.
 * @template T
 * @param {import('eslint').Rule.RuleContext} context
 * @param {() => T} lookup
 * @returns {T | undefined} undefined if the package.json is malformed, so that the caller can skip.
 */
function reportingMalformedPackageJson(context, lookup) {
    try {
        return lookup();
    } catch (error) {
        if (!(error instanceof MalformedPackageJsonError)) {
            throw error;
        }
        if (!reportedPackageJsonPaths.has(error.packageJsonPath)) {
            reportedPackageJsonPaths.add(error.packageJsonPath);
            context.report({ loc: { line: 0, column: 0 }, message: error.message });
        }
        return undefined;
    }
}

module.exports = { findPackageJson, readPackageJson, reportingMalformedPackageJson, MalformedPackageJsonError };
