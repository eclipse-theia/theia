// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
 * `MalformedPackageJsonError` is cached as well so that a broken file is only read once. Entries
 * are validated against the modification time and size of the file, so that a long lived ESLint
 * process, such as the one behind an editor integration, picks up an edited or repaired
 * package.json. An edit which keeps the size and lands within the same millisecond is missed,
 * which is the same trade-off the ESLint file cache makes.
 * @type {Map<string, {mtimeMs: number, size: number, result: FoundPackageJson | MalformedPackageJsonError}>}
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
    const packageJsonPath = path.resolve(resolved, 'package.json');
    const stat = fs.statSync(packageJsonPath, { throwIfNoEntry: false });
    if (!stat) {
        readPackageJsonCache.delete(resolved);
        return undefined;
    }
    const cached = readPackageJsonCache.get(resolved);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        if (cached.result instanceof MalformedPackageJsonError) {
            throw cached.result;
        }
        return cached.result;
    }
    /** @type {FoundPackageJson | MalformedPackageJsonError} */
    let result;
    try {
        result = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf8' }));
        result['__filename'] = packageJsonPath;
    } catch (error) {
        result = new MalformedPackageJsonError(packageJsonPath, error);
    }
    readPackageJsonCache.set(resolved, { mtimeMs: stat.mtimeMs, size: stat.size, result });
    if (result instanceof MalformedPackageJsonError) {
        throw result;
    }
    return result;
}

/**
 * Keep a shortcut from a directory to the directory holding its closest package.json, based on
 * previous crawls. Only the location is cached, the content still goes through `readPackageJson`,
 * so that an edited package.json is picked up. A package.json created in between the two
 * directories after the crawl is missed.
 * @type {Map<string, string>}
 */
const findPackageJsonCache = new Map();

/**
 * Finds the closest package.json by walking up from `from`.
 * @param {string} from file or directory path to start searching from. A path that does not exist
 * is treated as a file path, e.g. the virtual file names a rule gets in unit tests.
 * @returns {FoundPackageJson | undefined}
 * @throws {MalformedPackageJsonError} if a package.json on the way up cannot be read or parsed.
 */
function findPackageJson(from) {
    const resolved = path.resolve(from);
    const stat = fs.statSync(resolved, { throwIfNoEntry: false });
    let current = stat && stat.isDirectory() ? resolved : path.dirname(resolved);
    // Keep track of all paths tried before eventually finding a package.json file
    const tried = [current];
    while (true) {
        const cachedDir = findPackageJsonCache.get(current);
        if (cachedDir) {
            const cached = readPackageJson(cachedDir);
            if (cached) {
                return cached;
            }
            // The package.json has been deleted in the meantime, so crawl again from here.
            findPackageJsonCache.delete(current);
        }
        const packageJson = readPackageJson(current);
        if (packageJson) {
            for (const dir of tried) {
                findPackageJsonCache.set(dir, current);
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
 * Derives the Theia package name for the given file from its closest package.json. Only packages
 * living directly in 'packages' or 'dev-packages' follow the logger naming convention, so anything
 * else (examples, the monorepo root) yields undefined. Resolving the package rather than matching
 * path segments also keeps files in a checkout below a directory which happens to be named
 * 'packages' from resolving against that outer directory. The package.json `name` (without npm
 * scope) wins over the directory name as the two can differ, e.g. 'ai-hugging-face' contains
 * '@theia/ai-huggingface'.
 * @param {string} filename
 * @returns {string | undefined}
 * @throws {MalformedPackageJsonError} if a package.json on the way up cannot be read or parsed.
 */
function derivePackageName(filename) {
    const packageJson = findPackageJson(filename);
    if (!packageJson) {
        return undefined;
    }
    const packageDir = path.dirname(packageJson.__filename);
    const root = path.basename(path.dirname(packageDir));
    if (root !== 'packages' && root !== 'dev-packages') {
        return undefined;
    }
    return typeof packageJson.name === 'string' ? packageJson.name.replace(/^@[^/]+\//, '') : path.basename(packageDir);
}

/**
 * Errors already reported, as the same broken file would otherwise be reported again for every
 * linted file of the package. Re-reading a changed package.json produces a new error instance, so
 * a file which is repaired and later broken again is reported again.
 * @type {WeakSet<MalformedPackageJsonError>}
 */
const reportedErrors = new WeakSet();

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
        if (!reportedErrors.has(error)) {
            reportedErrors.add(error);
            context.report({ loc: { line: 0, column: 0 }, message: error.message });
        }
        return undefined;
    }
}

module.exports = { findPackageJson, derivePackageName, reportingMalformedPackageJson, MalformedPackageJsonError };
