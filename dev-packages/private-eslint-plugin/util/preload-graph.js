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

// The plugin is private to the monorepo, so it uses the parser hoisted at the root, the same way
// 'localization-check' uses the metadata of '@theia/core'.
// eslint-disable-next-line import/no-extraneous-dependencies
const parser = require('@typescript-eslint/parser');

const { findPackageJson } = require('./package-json');

/**
 * @typedef {import('estree').Node} Node
 * @typedef {import('eslint').Scope.ScopeManager} ScopeManager
 */

/**
 * An import that survives compilation, i.e. one that makes the imported module be evaluated.
 * @typedef ModuleImport
 * @property {string} specifier the module specifier as written in the source.
 * @property {Node} node the node carrying the specifier, for reporting.
 */

/**
 * A call of the NLS API that runs while the module is being evaluated.
 * @typedef NlsCall
 * @property {string} callee the called function, e.g. `nls.localizeByDefault`.
 * @property {Node} node the call expression, for reporting.
 */

/**
 * @typedef SourceAnalysis
 * @property {ModuleImport[]} imports
 * @property {NlsCall[]} nlsCalls
 */

/**
 * The file extensions of sources we follow, in resolution order. Declaration files are left out
 * because they carry no runtime code.
 */
const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * The functions that read the localization data. `Command.toLocalizedCommand` and
 * `Command.toDefaultLocalizedCommand` are included because they delegate to `nls`.
 * @param {Node} callee
 * @returns {string | undefined} the name to report, or undefined if this is not an NLS call.
 */
function nlsCalleeName(callee) {
    if (callee.type !== 'MemberExpression' || callee.computed || callee.object.type !== 'Identifier' || callee.property.type !== 'Identifier') {
        return undefined;
    }
    const object = callee.object.name;
    const property = callee.property.name;
    if (object === 'nls' && property.startsWith('localize')) {
        return `${object}.${property}`;
    }
    if (object === 'Command' && (property === 'toLocalizedCommand' || property === 'toDefaultLocalizedCommand')) {
        return `${object}.${property}`;
    }
    return undefined;
}

/**
 * The child nodes of a node, each with the property it is reached through.
 * @param {Node} node
 * @returns {Array<[string, Node]>}
 */
function childNodes(node) {
    /** @type {Array<[string, Node]>} */
    const result = [];
    for (const [key, value] of Object.entries(node)) {
        // 'parent' points back up the tree and would make a traversal loop.
        if (key === 'parent' || !value || typeof value !== 'object') {
            continue;
        }
        for (const child of Array.isArray(value) ? value : [value]) {
            if (child && typeof child.type === 'string') {
                result.push([key, child]);
            }
        }
    }
    return result;
}

/**
 * Visits every node of the given tree. Own traversal rather than the one of ESLint, so that the
 * same analysis can run on the file being linted and on the files it pulls in.
 * @param {Node} node
 * @param {(node: Node) => void} visit
 */
function forEachNode(node, visit) {
    visit(node);
    for (const [, child] of childNodes(node)) {
        forEachNode(child, visit);
    }
}

/**
 * Walks the AST, tracking whether the visited node is evaluated while the module is loaded.
 * @param {Node} node
 * @param {boolean} moduleLevel whether `node` is evaluated while the module is loaded.
 * @param {(node: Node, moduleLevel: boolean) => void} visit
 */
function walk(node, moduleLevel, visit) {
    visit(node, moduleLevel);
    for (const [key, child] of childNodes(node)) {
        walk(child, childIsModuleLevel(node, key, moduleLevel), visit);
    }
}

/**
 * Whether the child reached through `key` of `node` still runs while the module is loaded.
 * @param {Node} node
 * @param {string} key the property of `node` the child is reached through.
 * @param {boolean} moduleLevel whether `node` itself is evaluated while the module is loaded.
 * @returns {boolean}
 */
function childIsModuleLevel(node, key, moduleLevel) {
    if (!moduleLevel) {
        return false;
    }
    switch (node.type) {
        case 'FunctionDeclaration':
        case 'FunctionExpression':
        case 'ArrowFunctionExpression':
            // Everything in a function, including the default values of its parameters, is only
            // evaluated once the function is called.
            return false;
        case 'PropertyDefinition':
        case 'TSAbstractPropertyDefinition':
            // The initializer of an instance field runs on construction, while its decorators and
            // its computed key are evaluated when the class is defined.
            return key !== 'value' || Boolean(node['static']);
        case 'TSModuleDeclaration':
            // A namespace body is evaluated with the module, unless it is merely declared.
            return !node['declare'];
        default:
            return true;
    }
}

/**
 * Whether the given import or export declaration makes the referenced module be evaluated. Type-only
 * declarations, and named imports whose bindings are never used as a value, are erased by the
 * compiler and therefore pull in nothing at runtime.
 * @param {Node} node an import or export declaration with a source.
 * @param {ScopeManager} scopeManager
 * @returns {boolean}
 */
function isRuntimeImport(node, scopeManager) {
    if (node['importKind'] === 'type' || node['exportKind'] === 'type') {
        return false;
    }
    if (node.type !== 'ImportDeclaration') {
        // A re-export has no local binding to look at. `export * from` and `export { x } from` are
        // assumed to carry values, which is the safe assumption for the barrel files this looks for.
        return true;
    }
    if (node.specifiers.length === 0) {
        // A bare `import './x'` is only there for its side effects, so it is never erased.
        return true;
    }
    return scopeManager.getDeclaredVariables(node).some(variable => variable.references.some(reference =>
        // A parser without type-aware scope information reports no 'isValueReference' at all, in
        // which case every reference has to count.
        reference['isValueReference'] !== false));
}

/**
 * Collects the runtime imports and the NLS calls evaluated on load of an already parsed module.
 * @param {Node} ast the `Program` node.
 * @param {ScopeManager} scopeManager
 * @returns {SourceAnalysis}
 */
function analyzeSource(ast, scopeManager) {
    /** @type {ModuleImport[]} */
    const imports = [];
    /** @type {NlsCall[]} */
    const nlsCalls = [];
    walk(ast, true, (node, moduleLevel) => {
        switch (node.type) {
            case 'ImportDeclaration':
            case 'ExportNamedDeclaration':
            case 'ExportAllDeclaration': {
                const source = node['source'];
                if (source && typeof source.value === 'string' && isRuntimeImport(node, scopeManager)) {
                    imports.push({ specifier: source.value, node: source });
                }
                break;
            }
            case 'TSImportEqualsDeclaration': {
                const reference = node['moduleReference'];
                if (reference?.type === 'TSExternalModuleReference' && typeof reference.expression?.value === 'string') {
                    imports.push({ specifier: reference.expression.value, node: reference.expression });
                }
                break;
            }
            case 'CallExpression': {
                if (!moduleLevel) {
                    break;
                }
                // A `require` evaluated on load pulls in its module just like an import does, while a
                // dynamic `import()` resolves later and is therefore not part of the preload phase.
                if (node.callee.type === 'Identifier' && node.callee.name === 'require') {
                    const argument = node.arguments[0];
                    if (argument?.type === 'Literal' && typeof argument.value === 'string') {
                        imports.push({ specifier: argument.value, node: argument });
                    }
                }
                const callee = nlsCalleeName(node.callee);
                if (callee) {
                    nlsCalls.push({ callee, node });
                }
                break;
            }
        }
    });
    return { imports, nlsCalls };
}

/**
 * Parses the file at the given path.
 * @param {string} file absolute path of an existing source file.
 * @returns {{ast: Node, scopeManager: ScopeManager} | undefined} undefined if the file cannot be
 * read or parsed. A file that does not parse is reported by the compiler and by ESLint itself, so
 * it is simply not followed here.
 */
function parseFile(file) {
    try {
        const { ast, scopeManager } = parser.parseForESLint(fs.readFileSync(file, { encoding: 'utf8' }), {
            ecmaFeatures: { jsx: file.endsWith('x') },
            loc: true,
            range: true,
            sourceType: 'module'
        });
        return {
            ast: /** @type {Node} */(/** @type {unknown} */(ast)),
            scopeManager: /** @type {ScopeManager} */(/** @type {unknown} */(scopeManager))
        };
    } catch {
        return undefined;
    }
}

/**
 * The analysis of files read from disk, keyed by absolute path. Entries are validated against the
 * modification time and size of the file, following the same trade-off as the package.json cache.
 * @type {Map<string, {mtimeMs: number, size: number, analysis: SourceAnalysis}>}
 */
const analyzeFileCache = new Map();

/**
 * Parses and analyzes the file at the given path.
 * @param {string} file absolute path of an existing source file.
 * @returns {SourceAnalysis} an empty analysis if the file cannot be read or parsed.
 */
function analyzeFile(file) {
    const stat = fs.statSync(file, { throwIfNoEntry: false });
    if (!stat) {
        return { imports: [], nlsCalls: [] };
    }
    const cached = analyzeFileCache.get(file);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.analysis;
    }
    const parsed = parseFile(file);
    const analysis = parsed ? analyzeSource(parsed.ast, parsed.scopeManager) : { imports: [], nlsCalls: [] };
    analyzeFileCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, analysis });
    return analysis;
}

/**
 * The canonical path of a file, so that a file reached through a symbolic link, such as the
 * 'node_modules' entry of a workspace package or a checkout below a linked directory, is one and
 * the same path however it is reached. Only the directory is canonicalized, as the file itself does
 * not have to exist: it may be the virtual name a rule gets in a unit test, or a file that has not
 * been written to disk yet.
 * @param {string} file
 * @returns {string} the absolute path itself if its directory cannot be canonicalized.
 */
function realPath(file) {
    const resolved = path.resolve(file);
    try {
        return path.join(fs.realpathSync(path.dirname(resolved)), path.basename(resolved));
    } catch {
        return resolved;
    }
}

/**
 * Resolves a path without extension to an existing source file, trying the extensions we compile
 * and then the index file of a directory, as the TypeScript compiler does.
 * @param {string} base
 * @returns {string | undefined}
 */
function resolveSourceFile(base) {
    for (const candidate of [...sourceExtensions.map(extension => base + extension), ...sourceExtensions.map(extension => path.join(base, `index${extension}`))]) {
        const stat = fs.statSync(candidate, { throwIfNoEntry: false });
        if (stat?.isFile()) {
            return candidate;
        }
    }
    return undefined;
}

/**
 * Finds the directory of an installed package by walking up the 'node_modules' directories, as
 * Node.js does. In the monorepo the entries of 'node_modules' are symbolic links to the packages,
 * so the real path is the source of the package rather than a published copy of it.
 * @param {string} from directory to start the search in.
 * @param {string} packageName
 * @returns {string | undefined}
 */
function resolvePackageDirectory(from, packageName) {
    let current = path.resolve(from);
    while (true) {
        const packageJson = path.join(current, 'node_modules', packageName, 'package.json');
        if (fs.statSync(packageJson, { throwIfNoEntry: false })?.isFile()) {
            return fs.realpathSync(path.dirname(packageJson));
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return undefined;
        }
        current = parent;
    }
}

/**
 * Resolves a module specifier to the source file it is compiled from. Only sources belonging to the
 * workspace resolve, which is what we want: a published dependency ships no sources and contributes
 * no Theia preload code.
 * @param {string} from absolute path of the importing file.
 * @param {string} specifier
 * @returns {string | undefined}
 */
function resolveModule(from, specifier) {
    if (specifier.startsWith('.')) {
        return resolveSourceFile(path.resolve(path.dirname(from), specifier));
    }
    const segments = specifier.split('/');
    // A scoped package name spans two segments, e.g. '@theia/core'.
    const name = segments.slice(0, specifier.startsWith('@') ? 2 : 1).join('/');
    const rest = specifier.slice(name.length).replace(/^\//, '');
    const packageDirectory = resolvePackageDirectory(path.dirname(from), name);
    if (!packageDirectory) {
        return undefined;
    }
    return resolvePackageSource(packageDirectory, rest);
}

/**
 * Maps a path inside a package to the source it is compiled from. Theia packages are imported
 * through their 'lib' output, which mirrors 'src'.
 * @param {string} packageDirectory
 * @param {string} rest the part of the specifier below the package name, possibly empty.
 * @returns {string | undefined}
 */
function resolvePackageSource(packageDirectory, rest) {
    let relative = rest;
    if (relative === '') {
        const packageJson = findPackageJson(packageDirectory);
        const main = packageJson && packageJson['main'];
        if (typeof main !== 'string') {
            return undefined;
        }
        relative = main.replace(/\.js$/, '');
    }
    if (!relative.startsWith('lib/')) {
        return undefined;
    }
    return resolveSourceFile(path.join(packageDirectory, 'src', relative.slice('lib/'.length)));
}

/**
 * Searches the modules pulled in by `file` for one that reads the localization data while it is
 * loaded. The search is breadth-first, so that the shortest chain of imports is reported.
 * @param {string} file absolute path of the module to start from.
 * @returns {{chain: string[], nlsCall: NlsCall} | undefined} the files leading from `file` to the
 * offending module, `file` included, and the first offending call in it.
 */
function findLoadTimeNlsCall(file) {
    /** @type {Map<string, string | undefined>} */
    const visitedFrom = new Map([[file, undefined]]);
    for (let queue = [file]; queue.length > 0;) {
        /** @type {string[]} */
        const next = [];
        for (const current of queue) {
            const analysis = analyzeFile(current);
            const nlsCall = analysis.nlsCalls[0];
            if (nlsCall) {
                /** @type {string[]} */
                const chain = [];
                for (let step = /** @type {string | undefined} */(current); step !== undefined; step = visitedFrom.get(step)) {
                    chain.unshift(step);
                }
                return { chain, nlsCall };
            }
            for (const { specifier } of analysis.imports) {
                const resolved = resolveModule(current, specifier);
                if (resolved !== undefined && !visitedFrom.has(resolved)) {
                    visitedFrom.set(resolved, current);
                    next.push(resolved);
                }
            }
        }
        queue = next;
    }
    return undefined;
}

module.exports = {
    analyzeSource, analyzeFile, parseFile, forEachNode, findLoadTimeNlsCall,
    realPath, resolveModule, resolvePackageSource, resolveSourceFile, resolvePackageDirectory
};
