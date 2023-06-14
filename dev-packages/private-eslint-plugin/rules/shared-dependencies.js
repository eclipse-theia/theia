// @ts-check
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

/* eslint-disable max-len */

const fs = require('fs');
const path = require('path');
const { PackageReExports } = require('@theia/re-exports');

const coreReExports = PackageReExports.FromPackageSync('@theia/core');

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        fixable: 'code',
        docs: {
            description: 'Errors when a dependency shared by @theia/core is used implicitly, or when a package depends on a shared dependency instead of reusing it from @theia/core/shared. This rule only affects files from packages that depend on @theia/core.',
            recommended: true,
        },
    },
    create(context) {
        const filename = context.getFilename();
        const packageJson = findPackageJson(filename);
        if (packageJson && dependsOnTheiaCore(packageJson)) {
            // Only show an error regarding the package.json file if this is the first
            // time we detect the error, else it will error for every file of the package:
            if (firstTime(packageJson.__filename)) {
                const redundantDeps = getRedundantDependencies(packageJson);
                if (redundantDeps.length > 0) {
                    context.report({
                        loc: { line: 0, column: 0 },
                        message: `"${packageJson.__filename}" depends on some @theia/core shared dependencies: [${redundantDeps}]`,
                    });
                }
            }
            function checkModuleImport(node) {
                const moduleName = /** @type {string} */(node.value);
                const reExport = coreReExports.findReExportByModuleName(moduleName);
                if (reExport) {
                    context.report({
                        node,
                        message: `"${moduleName}" is a @theia/core shared dependency, please use "${reExport.externalImport}" instead.`,
                        fix(fixer) {
                            if (node.range) {
                                const [start, end] = node.range;
                                // Make sure to insert text between the first quote of the string and the rest:
                                return fixer.insertTextBeforeRange([start + 1, end], `${coreReExports.packageName}/${reExport.reExportDir}`);
                            }
                        }
                    });
                }
            }
            return {
                ImportDeclaration(node) {
                    checkModuleImport(node.source);
                },
                TSExternalModuleReference(node) {
                    checkModuleImport(node.expression);
                },
            };
        }
        return {};
    },
};

/** @type {Set<string>} */
const firstTimeCache = new Set();
/**
 * @param {string} key
 * @returns {boolean} true if first time seeing `key` else false.
 */
function firstTime(key) {
    if (firstTimeCache.has(key)) {
        return false;
    } else {
        firstTimeCache.add(key);
        return true;
    }
}

/**
 * @typedef FoundPackageJson
 * @property {string} __filename
 * @property {{[package: string]: string}} [dependencies]
 */

/**
 * Keep a shortcut to a given package.json file based on previous crawls.
 * @type {Map<string, FoundPackageJson>}
 */
const findPackageJsonCache = new Map();
/**
 * @param {string} from file path to start searching from.
 * @returns {FoundPackageJson | undefined}
 */
function findPackageJson(from) {
    from = path.resolve(from);
    let current = fs.statSync(from).isDirectory() ? from : path.dirname(from);
    // Keep track of all paths tried before eventually finding a package.json file
    const tried = [current];
    while (!isRoot(path.parse(from))) {
        const cached = findPackageJsonCache.get(current);
        if (cached) {
            return cached;
        }
        const packageJsonPath = path.resolve(current, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, { encoding: 'utf8' }));
            for (const dir of tried) {
                findPackageJsonCache.set(dir, packageJson);
            }
            packageJson['__filename'] = packageJsonPath;
            return packageJson;
        }
        current = path.dirname(current);
        tried.push(current);
    }
}

/**
 * @param {path.ParsedPath} parsed
 * @returns {boolean}
 */
function isRoot(parsed) {
    return parsed.base === '' && parsed.dir === parsed.root;
}

/**
 * @param {object} packageJson
 * @returns {boolean}
 */
function dependsOnTheiaCore(packageJson) {
    return typeof packageJson.dependencies === 'object'
        && '@theia/core' in packageJson.dependencies;
}

/**
 * Return a list of packages from `packageJson`'s dependencies that can be
 * required using `@theia/core/(electron-)shared/...`.
 * @param {object} packageJson
 * @return {string[]}
 */
function getRedundantDependencies(packageJson) {
    return typeof packageJson.dependencies === 'object'
        ? Object.keys(packageJson.dependencies).filter(
            dependency => coreReExports.findReExportsByPackageName(dependency).length > 0
        )
        : [];
}
