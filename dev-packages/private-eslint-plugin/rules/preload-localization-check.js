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

const path = require('path');

const { preloadPhaseModules } = require('../util/frontend-generator');
const { findPackageJson, reportingMalformedPackageJson } = require('../util/package-json');
const { analyzeSource, findLoadTimeNlsCall, realPath, resolveModule, resolvePackageSource } = require('../util/preload-graph');

/**
 * @typedef {import('estree').Node} Node
 * @typedef {import('eslint').Rule.RuleContext} RuleContext
 * @typedef {import('eslint').Rule.RuleModule} RuleModule
 */

/**
 * The 'theiaExtensions' entry points that are loaded during the preload phase: the Electron preload
 * script and the container modules the frontend loads before it runs the `Preloader`.
 */
const preloadEntryPointKeys = ['preload', 'frontendPreload', 'frontendOnlyPreload'];

/**
 * The modules that the generated frontend 'index.js' requires before the `Preloader` has run, and
 * which are therefore part of the preload phase without being declared as entry points in any
 * package.json. These are normally read from the sources of `FrontendGenerator` in the workspace,
 * so that they follow the generator rather than having to be kept in sync with it by hand. This
 * list is only the fallback for a workspace that does not contain those sources, or whose generator
 * no longer has the shape that `preloadPhaseModules` recognizes.
 */
const fallbackAdditionalEntryPoints = [
    '@theia/core/lib/browser/frontend-application-config-provider',
    '@theia/core/lib/browser/messaging/messaging-frontend-module',
    '@theia/core/lib/browser-only/messaging/messaging-frontend-only-module',
    '@theia/core/lib/electron-browser/messaging/electron-messaging-frontend-module',
    '@theia/core/lib/browser/preload/preloader'
];

/**
 * The entry points of a package, keyed by the directory of its package.json and the configured
 * additional entry points, as the rule runs for every linted file.
 * @type {Map<string, Set<string>>}
 */
const entryPointCache = new Map();

/**
 * Collects the absolute paths of the preload sources of the package `file` belongs to. Resolving
 * the additional entry points from that package as well keeps every package that depends on
 * '@theia/core' from having to repeat them, and yields nothing for packages that do not.
 * @param {string} file absolute path of the linted file.
 * @param {string[] | undefined} configuredEntryPoints the additional entry points of the rule
 * options, if any, which replace the ones read from the frontend generator.
 * @returns {Set<string>}
 * @throws {import('../util/package-json').MalformedPackageJsonError} if the package.json of `file`
 * cannot be read or parsed.
 */
function preloadEntryPoints(file, configuredEntryPoints) {
    const packageJson = findPackageJson(file);
    if (!packageJson) {
        return new Set();
    }
    const packageDirectory = path.dirname(packageJson.__filename);
    const additionalEntryPoints = configuredEntryPoints ?? preloadPhaseModules(packageJson.__filename) ?? fallbackAdditionalEntryPoints;
    // Keying on the entry points as well means that editing the frontend generator, which yields a
    // different list, invalidates what was cached for it.
    const cacheKey = `${packageDirectory}\0${additionalEntryPoints.join('\0')}`;
    const cached = entryPointCache.get(cacheKey);
    if (cached) {
        return cached;
    }
    const entryPoints = new Set();
    for (const extension of packageJson['theiaExtensions'] ?? []) {
        for (const key of preloadEntryPointKeys) {
            const entryPoint = typeof extension[key] === 'string' ? resolvePackageSource(packageDirectory, extension[key]) : undefined;
            if (entryPoint) {
                entryPoints.add(entryPoint);
            }
        }
    }
    for (const specifier of additionalEntryPoints) {
        const entryPoint = resolveModule(packageJson.__filename, specifier);
        if (entryPoint) {
            entryPoints.add(entryPoint);
        }
    }
    entryPointCache.set(cacheKey, entryPoints);
    return entryPoints;
}

/** @type {RuleModule} */
module.exports = {
    meta: {
        type: 'problem',
        docs: {
            description: 'prevent code of the preload phase from reading localized strings while it is loaded.',
            url: 'https://github.com/eclipse-theia/theia/tree/master/doc/coding-guidelines.md#internationalizationlocalization'
        },
        messages: {
            loadTimeNls: "'{{callee}}' is evaluated while this preload module is loaded, before the localization data is available, so the string stays untranslated. "
                + 'Read it from code that runs after the preload phase instead.',
            importedLoadTimeNls: "'{{specifier}}' evaluates '{{callee}}' on load, before the localization data is available, so the string stays untranslated. "
                + 'Import the symbols you need from a module that does not localize on load.',
            transitiveLoadTimeNls: "'{{specifier}}' pulls in '{{module}}', which evaluates '{{callee}}' on load, before the localization data is available, "
                + "so the string stays untranslated. Import the symbols you need directly, rather than through '{{chain}}'."
        },
        schema: [{
            type: 'object',
            properties: {
                additionalEntryPoints: {
                    type: 'array',
                    items: { type: 'string' }
                }
            },
            additionalProperties: false
        }]
    },
    create(context) {
        // The canonical path, because the entry points are resolved through 'node_modules', where a
        // workspace package is a symbolic link, and the linted file has to be comparable with them.
        const file = realPath(context.getFilename());
        const entryPoints = reportingMalformedPackageJson(context, () => preloadEntryPoints(file, context.options[0]?.additionalEntryPoints));
        // Only the entry points are checked, following their imports from there. The modules they
        // pull in are reported on the import that pulls them in, which is where the problem can be
        // fixed, and which is the only place where it is known that they run during the preload phase.
        if (!entryPoints?.has(file)) {
            return {};
        }
        return {
            'Program:exit'(program) {
                const { imports, nlsCalls } = analyzeSource(program, context.getSourceCode().scopeManager);
                for (const { callee, node } of nlsCalls) {
                    context.report({ node, messageId: 'loadTimeNls', data: { callee } });
                }
                for (const { specifier, node } of imports) {
                    const imported = resolveModule(file, specifier);
                    const found = imported ? findLoadTimeNlsCall(imported) : undefined;
                    if (!found) {
                        continue;
                    }
                    const chain = found.chain.map(step => path.relative(context.getCwd(), step).replace(/\\/g, '/'));
                    const data = { specifier, callee: found.nlsCall.callee, module: chain[chain.length - 1], chain: chain.join(' -> ') };
                    context.report({ node, messageId: chain.length > 1 ? 'transitiveLoadTimeNls' : 'importedLoadTimeNls', data });
                }
            }
        };
    }
};
