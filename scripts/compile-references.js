// @ts-check
'use-strict';

/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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

/**
 * This script generates tsconfig references between our workspaces, it also
 * configures our .eslintrc file to use such references.
 *
 * `tsc` build mode relies on these references to build out of date dependencies
 * only when required, but it cannot infer workspaces by itself, it has to be
 * explicitly defined [1].
 *
 * You can do a dry run using the cli flag `--dry-run`, the script will exit
 * with a code different from zero if something needed to be updated.
 *
 * [1]: https://www.typescriptlang.org/docs/handbook/project-references.html
 */


const cp = require('child_process');
const path = require('path').posix;
const fs = require('fs');

const ROOT = path.join(__dirname, '..');

const DRY_RUN = popFlag(process.argv, '--dry-run');

const FORCE_REWRITE = popFlag(process.argv, '--force-rewrite') && !DRY_RUN;

/** @type {{ [packageName: string]: YarnWorkspace }} */
const YARN_WORKSPACES = JSON.parse(cp.execSync('yarn --silent workspaces info').toString());

// Add the package name inside each package object.
for (const [packageName, yarnWorkspace] of Object.entries(YARN_WORKSPACES)) {
    yarnWorkspace.name = packageName;
}

/** @type {YarnWorkspace} */
const THEIA_MONOREPO = {
    name: '@theia/monorepo',
    workspaceDependencies: Object.keys(YARN_WORKSPACES),
    location: ROOT,
};

try {
    let rewriteRequired = false;
    let result = false;

    // Configure all `compile.tsconfig.json` files of this monorepo
    for (const packageName of Object.keys(YARN_WORKSPACES)) {
        const workspacePackage = YARN_WORKSPACES[packageName];
        const tsconfigCompilePath = path.join(ROOT, workspacePackage.location, 'compile.tsconfig.json');
        const references = getTypescriptReferences(workspacePackage);
        result = configureTypeScriptCompilation(workspacePackage, tsconfigCompilePath, references);
        rewriteRequired = rewriteRequired || result;
    }

    // Configure our root compilation configuration, living inside `configs/root-compilation.tsconfig.json`.
    const configsFolder = path.join(ROOT, 'configs');
    const tsconfigCompilePath = path.join(configsFolder, 'root-compilation.tsconfig.json');
    const references = getTypescriptReferences(THEIA_MONOREPO, configsFolder);
    result = configureTypeScriptCompilation(THEIA_MONOREPO, tsconfigCompilePath, references);
    rewriteRequired = rewriteRequired || result;

    // Configure the root `tsconfig.json` for code navigation using `tsserver`.
    const tsconfigNavPath = path.join(ROOT, 'tsconfig.json');
    result = configureTypeScriptNavigation(THEIA_MONOREPO, tsconfigNavPath);
    rewriteRequired = rewriteRequired || result;

    // CI will be able to tell if references got changed by looking at the exit code.
    if (rewriteRequired) {
        if (DRY_RUN) {
            // Running a dry run usually only happens when a developer or CI runs the tests, so we only print the help then.
            console.error('TypeScript references seem to be out of sync, run "yarn prepare:references" to fix.');
            process.exitCode = 1;
        } else {
            console.warn('TypeScript references were out of sync and got updated.');
        }
    }

} catch (error) {
    console.error(error);
    process.exitCode = 1;
}

/**
 * @param {YarnWorkspace} requestedPackage
 * @param {string} [overrideLocation] affects how relative paths are computed.
 * @returns {string[]} project references for `requestedPackage`.
 */
function getTypescriptReferences(requestedPackage, overrideLocation) {
    const references = [];
    for (const dependency of requestedPackage.workspaceDependencies || []) {
        const depWorkspace = YARN_WORKSPACES[dependency];
        const depConfig = path.join(depWorkspace.location, 'compile.tsconfig.json');
        if (!fs.existsSync(depConfig)) {
            continue;
        }
        const relativePath = path.relative(overrideLocation || requestedPackage.location, depWorkspace.location);
        references.push(relativePath);
    }
    return references;
}

/**
 * Wires a given compilation tsconfig file according to the provided references.
 * This allows TypeScript to operate in build mode.
 *
 * @param {YarnWorkspace} targetPackage for debug purpose.
 * @param {string} tsconfigPath path to the tsconfig file to edit.
 * @param {string[]} references list of paths to the related project roots.
 * @returns {boolean} rewrite was needed.
 */
function configureTypeScriptCompilation(targetPackage, tsconfigPath, references) {
    if (!fs.existsSync(tsconfigPath)) {
        return false;
    }
    const tsconfigJson = readJsonFile(tsconfigPath);

    let needRewrite = FORCE_REWRITE;

    if (!tsconfigJson.compilerOptions) {
        // Somehow no `compilerOptions` literal is defined.
        tsconfigJson.compilerOptions = {
            composite: true,
            rootDir: 'src',
            outDir: 'lib',
        };
        needRewrite = true;

    } else if (!tsconfigJson.compilerOptions.composite) {
        // `compilerOptions` is missing the `composite` literal.
        tsconfigJson.compilerOptions = {
            composite: true,
            ...tsconfigJson.compilerOptions,
        };
        needRewrite = true;
    }

    /** @type {string[]} */
    const tsconfigReferences = references
        .map(reference => path.join(reference, 'compile.tsconfig.json'));

    /** @type {string[]} */
    const currentReferences = (tsconfigJson['references'] || [])
        // We will work on a set of paths, easier to handle than objects.
        .map(reference => reference.path)
        // Remove any invalid reference (maybe outdated).
        .filter((referenceRelativePath, index, self) => {
            if (!tsconfigReferences.includes(referenceRelativePath)) {
                // Found a reference that wasn't automatically computed, will remove.
                console.warn(`error: ${targetPackage.name} untracked reference: ${referenceRelativePath}`);
                needRewrite = true;
                return false; // remove
            }
            if (self.indexOf(referenceRelativePath) !== index) {
                // Remove duplicates.
                console.error(`error: ${targetPackage.name} duplicate reference: ${referenceRelativePath}`);
                needRewrite = true;
                return false; // remove
            }
            const referencePath = path.join(path.dirname(tsconfigPath), referenceRelativePath);
            try {
                const referenceStat = fs.statSync(referencePath);
                if (referenceStat.isDirectory() && fs.statSync(path.join(referencePath, 'tsconfig.json')).isFile()) {
                    return true; // keep
                } else if (referenceStat.isFile()) { // still could be something else than a tsconfig, but good enough.
                    return true; // keep
                }
            } catch {
                // passthrough
            }
            console.error(`error: ${targetPackage.name} invalid reference: ${referenceRelativePath}`);
            needRewrite = true;
            return false; // remove
        });

    for (const tsconfigReference of tsconfigReferences) {
        if (!currentReferences.includes(tsconfigReference)) {
            console.error(`error: ${targetPackage.name} missing reference: ${tsconfigReference}`);
            currentReferences.push(tsconfigReference);
            needRewrite = true;
        }
    }
    if (!DRY_RUN && needRewrite) {
        tsconfigJson.references = currentReferences.map(path => ({ path }));
        const content = JSON.stringify(tsconfigJson, undefined, 2);
        fs.writeFileSync(tsconfigPath, content + '\n');
        console.warn(`info: ${tsconfigPath} updated.`);
    }
    return needRewrite;
}

/**
 * Wire the root `tsconfig.json` to map scoped import to real location in the monorepo.
 * This setup is a shim for the TypeScript language server to provide cross-package navigation.
 * Compilation is done via `compile.tsconfig.json` files.
 *
 * @param {YarnWorkspace} targetPackage for debug purpose.
 * @param {string} tsconfigPath
 * @returns {boolean} rewrite was needed.
 */
function configureTypeScriptNavigation(targetPackage, tsconfigPath) {
    const tsconfigJson = readJsonFile(tsconfigPath);

    let needRewrite = FORCE_REWRITE;

    if (typeof tsconfigJson.compilerOptions === 'undefined') {
        // Somehow no `compilerOptions` literal is defined.
        tsconfigJson.compilerOptions = {
            baseUrl: '.',
            paths: {},
        };
        needRewrite = true;

    } else if (typeof tsconfigJson.compilerOptions.paths === 'undefined') {
        // `compilerOptions` is missing the `paths` literal.
        tsconfigJson.compilerOptions = {
            ...tsconfigJson.compilerOptions,
            paths: {},
        };
        needRewrite = true;
    }

    /** @type {{ [prefix: string]: string[] }} */
    const currentPaths = tsconfigJson.compilerOptions.paths;

    for (const packageName of THEIA_MONOREPO.workspaceDependencies) {
        const depWorkspace = YARN_WORKSPACES[packageName];

        /** @type {string} */
        let originalImportPath;
        /** @type {string} */
        let mappedFsPath;

        const depSrcPath = path.join(depWorkspace.location, 'src');
        const depConfigPath = path.join(depWorkspace.location, 'compile.tsconfig.json');

        if (fs.existsSync(depConfigPath) && fs.existsSync(depSrcPath)) {
            // If it is a TypeScript dependency, map `lib` imports to our local sources in `src`.
            const depConfigJson = readJsonFile(depConfigPath);
            originalImportPath = `${packageName}/${depConfigJson.compilerOptions.outDir}/*`;
            mappedFsPath = path.relative(THEIA_MONOREPO.location, path.join(depSrcPath, '*'));

        } else {
            // I don't really know what to do here, simply point to our local package root.
            originalImportPath = `${packageName}/*`;
            mappedFsPath = path.relative(THEIA_MONOREPO.location, path.join(depWorkspace.location, '*'));
        }

        /** @type {string[] | undefined} */
        const currentFsPaths = currentPaths[originalImportPath];

        if (typeof currentFsPaths === 'undefined' || currentFsPaths.length !== 1 || currentFsPaths[0] !== mappedFsPath) {
            console.error(`error: ${targetPackage.name} invalid mapped path: ${JSON.stringify({ [originalImportPath]: currentFsPaths })}`);
            currentPaths[originalImportPath] = [mappedFsPath];
            needRewrite = true;
        }
    }
    if (!DRY_RUN && needRewrite) {
        const content = JSON.stringify(tsconfigJson, undefined, 2);
        fs.writeFileSync(tsconfigPath, content + '\n');
        console.warn(`info: ${tsconfigPath} updated.`);
    }
    return needRewrite;
}

/**
 *
 * @param {string[]} argv
 * @param {string} flag
 * @returns {boolean}
 */
function popFlag(argv, flag) {
    const flagIndex = argv.indexOf(flag)
    if (flagIndex !== -1) {
        argv.splice(flagIndex, 1);
        return true;
    } else {
        return false;
    }
}

/**
 * @param {string} filePath
 * @returns {any}
 */
function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath).toString());
    } catch (error) {
        console.error('ParseError in file:', filePath);
        throw error;
    }
}

/**
 * @typedef YarnWorkspace
 * @property {string} name
 * @property {string} location
 * @property {string[]} workspaceDependencies
 */
