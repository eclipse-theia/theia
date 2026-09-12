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

const assert = require('assert');
const path = require('path');

// The plugin is private to the monorepo, so it uses the application manager hoisted at the root, the
// same way 'localization-check' uses the metadata of '@theia/core'. Its 'lib' is what a test runs
// against, so the workspace has to have been compiled, which is what the CI job running the tests
// does before it runs them.
/* eslint-disable import/no-extraneous-dependencies */
const { ApplicationPackage } = require('@theia/application-package');
const { FrontendGenerator } = require('@theia/application-manager/lib/generator/frontend-generator');
/* eslint-enable import/no-extraneous-dependencies */

const { modules: preloadPhaseModules } = require('./preload-phase-modules.json');
const { resolveModule } = require('./preload-graph');
const { tempFiles } = require('./test/temp-files');

/**
 * The targets a frontend is generated for, which decide the messaging modules the emitted code loads.
 */
const targets = ['browser', 'electron', 'browser-only'];

/**
 * The call of the emitted 'index.js' that ends the preload phase.
 */
const preloadPhaseEnd = 'await preload(container)';

/**
 * A `require('...')` of the emitted code.
 */
const emittedRequire = /require\('([^']*)'\)/g;

/**
 * Reaches the emitted index, which the generator only writes to disk as a whole application.
 */
class GeneratorProbe extends FrontendGenerator {
    /** @returns {string} */
    indexJs() {
        return this.compileIndexJs(new Map(), new Map());
    }
}

/**
 * The modules that the generator of this repository really requires before the preload phase is
 * over, for an application of the given target.
 * @param {string} target
 * @returns {string[]}
 */
function emittedPreloadPhaseModules(target) {
    const project = tempFiles({ 'package.json': JSON.stringify({ name: 'preload-phase-probe', theia: { target } }) });
    try {
        const indexJs = new GeneratorProbe(new ApplicationPackage({ projectPath: project.resolve('.') })).indexJs();
        const end = indexJs.indexOf(preloadPhaseEnd);
        assert.ok(end >= 0, `the emitted index of a '${target}' application does not end the preload phase with '${preloadPhaseEnd}'`);
        return [...indexJs.slice(0, end).matchAll(emittedRequire)].map(([, specifier]) => specifier);
    } finally {
        project.dispose();
    }
}

describe('preload-phase-modules', () => {

    // The specifiers that resolve to a source of the workspace, which are the ones the rule can
    // follow and therefore the ones the list is about. The others, 'reflect-metadata' and the shared
    // 'inversify' re-export, carry no Theia code.
    const from = path.resolve(__dirname, '..', 'package.json');
    const emitted = new Set(targets.flatMap(emittedPreloadPhaseModules).filter(specifier => resolveModule(from, specifier)));

    it('lists every module the generator loads before the preload phase is over', () => {
        const missing = [...emitted].filter(module => !preloadPhaseModules.includes(module));
        assert.deepStrictEqual(missing, [], `add these modules to 'preload-phase-modules.json', as the frontend loads them during the preload phase: ${missing}`);
    });

    it('lists nothing the generator does not load before the preload phase is over', () => {
        const stale = preloadPhaseModules.filter(module => !emitted.has(module));
        assert.deepStrictEqual(stale, [], `remove these modules from 'preload-phase-modules.json', as the frontend no longer loads them then: ${stale}`);
    });

    it('lists modules that are part of the workspace', () => {
        for (const module of preloadPhaseModules) {
            assert.ok(resolveModule(from, module), `'${module}' does not resolve to a source of the workspace`);
        }
    });
});
