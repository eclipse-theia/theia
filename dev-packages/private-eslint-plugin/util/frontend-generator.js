// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

const { forEachNode, parseFile, resolveModule } = require('./preload-graph');

/**
 * @typedef {import('estree').Node} Node
 */

/**
 * The generator of the frontend 'index.js', whose sources are read to find out which modules the
 * frontend loads before the preload phase is over.
 */
const frontendGeneratorModule = '@theia/application-manager/lib/generator/frontend-generator';

/**
 * The method of that generator emitting the 'index.js'.
 */
const indexJsMethod = 'compileIndexJs';

/**
 * The call of the emitted 'index.js' that ends the preload phase. Everything the emitted code
 * requires before it runs while the localization data is still missing.
 */
const preloadPhaseEnd = 'await preload(';

/**
 * A `require('...')` or `import('...')` of the emitted code, written out in full.
 */
const emittedImport = /(?:require|import)\(\s*'([^']*)'\s*\)/g;

/**
 * A `require('...')` or `import('...')` of the emitted code whose specifier is left open, because
 * the generator interpolates the rest of it.
 */
const emittedOpenImport = /(?:require|import)\(\s*'([^']*)$/;

/**
 * The leading part of a text that can belong to a module specifier.
 */
const specifierFragment = /^[\w@./-]+/;

/**
 * The modules derived from a generator source, keyed by its path and validated against the
 * modification time and size of the file, so that editing the generator is picked up.
 * @type {Map<string, {mtimeMs: number, size: number, modules: string[] | undefined}>}
 */
const cache = new Map();

/**
 * The modules that the generated frontend 'index.js' loads before the preload phase is over, and which
 * are therefore part of that phase without being declared as an entry point in any package.json.
 *
 * They are read from the sources of `FrontendGenerator` in the workspace rather than written down
 * here, so that they follow the generator, including while it is being worked on. Specifiers that
 * do not belong to the workspace, such as 'reflect-metadata', are returned as well; they simply
 * resolve to nothing.
 * @param {string} from absolute path of a file to resolve the generator from.
 * @returns {string[] | undefined} undefined if the generator is not part of the workspace, or if
 * its shape is not the one described above, in which case the caller has to fall back.
 */
function preloadPhaseModules(from) {
    const generator = resolveModule(from, frontendGeneratorModule);
    if (!generator) {
        return undefined;
    }
    const stat = fs.statSync(generator, { throwIfNoEntry: false });
    if (!stat) {
        return undefined;
    }
    const cached = cache.get(generator);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return cached.modules;
    }
    const modules = readPreloadPhaseModules(generator);
    cache.set(generator, { mtimeMs: stat.mtimeMs, size: stat.size, modules });
    return modules;
}

/**
 * @param {string} generator absolute path of the generator source.
 * @returns {string[] | undefined}
 */
function readPreloadPhaseModules(generator) {
    const parsed = parseFile(generator);
    const method = parsed && findMethod(parsed.ast, indexJsMethod);
    const emitted = method && emittedText(method);
    return emitted && importedModules(emitted);
}

/**
 * Finds the method of the given name, wherever in the tree it is declared.
 * @param {Node} ast
 * @param {string} name
 * @returns {Node | undefined}
 */
function findMethod(ast, name) {
    /** @type {Node | undefined} */
    let found;
    forEachNode(ast, node => {
        if (!found && node.type === 'MethodDefinition' && !node.computed && node['key']?.name === name) {
            found = node;
        }
    });
    return found;
}

/**
 * The text that the given method emits, as the pieces it is written from: the parts of its template
 * literals and the string literals of the expressions interpolated into them. The pieces are put
 * back into the order they appear in the source, which is the order they are emitted in, and are
 * cut off where the emitted code ends the preload phase.
 * @param {Node} method
 * @returns {string[] | undefined} undefined if the method does not emit the end of the preload
 * phase, in which case its shape is not the one this expects.
 */
function emittedText(method) {
    /** @type {Array<{start: number, text: string}>} */
    const pieces = [];
    forEachNode(method, node => {
        if (node.type === 'TemplateElement') {
            pieces.push({ start: node['range'][0], text: node['value'].cooked ?? node['value'].raw });
        } else if (node.type === 'Literal' && typeof node.value === 'string') {
            pieces.push({ start: node['range'][0], text: node.value });
        }
    });
    pieces.sort((one, other) => one.start - other.start);
    /** @type {string[]} */
    const emitted = [];
    for (const { text } of pieces) {
        const end = text.indexOf(preloadPhaseEnd);
        if (end >= 0) {
            emitted.push(text.slice(0, end));
            return emitted;
        }
        emitted.push(text);
    }
    return undefined;
}

/**
 * The modules that the emitted text requires. A specifier that the generator interpolates, such as
 * the messaging module chosen by target, is written as a `require` left open by one piece and
 * continued by the pieces of the interpolated expression, so an open specifier is combined with
 * each of the pieces that follow it until one closes the quote.
 * @param {string[]} emitted
 * @returns {string[]}
 */
function importedModules(emitted) {
    /** @type {Set<string>} */
    const modules = new Set();
    /** @type {string | undefined} */
    let open;
    for (const text of emitted) {
        if (open !== undefined) {
            const fragment = specifierFragment.exec(text)?.[0] ?? '';
            if (fragment) {
                modules.add(open + fragment);
            }
            // A piece that closes the quote, or that cannot continue a specifier at all, ends the
            // interpolation. Anything in between is another alternative of the same specifier.
            if (!fragment || text.charAt(fragment.length) === "'") {
                open = undefined;
            }
        }
        for (const [, specifier] of text.matchAll(emittedImport)) {
            modules.add(specifier);
        }
        const opened = emittedOpenImport.exec(text);
        if (opened) {
            open = opened[1];
        }
    }
    return [...modules];
}

module.exports = { preloadPhaseModules };
