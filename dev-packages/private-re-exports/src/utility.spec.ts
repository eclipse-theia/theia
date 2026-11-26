// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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
import os = require('os');
import path = require('path');
import { isCommonJsModule, isEsmOnlyModule, parseModule } from './utility';
import { expect } from 'chai';

describe('@theia/re-exports/lib/utility.js', () => {

    it('parseModule', () => {
        expect(parseModule('a')).length(1).members(['a']);
        expect(parseModule('a/')).length(1).members(['a']);
        expect(parseModule('a/b')).length(2).members(['a', 'b']);
        expect(parseModule('a/b/')).length(2).members(['a', 'b']);
        expect(parseModule('a/b/c/d/e/f')).length(2).members(['a', 'b/c/d/e/f']);
    });

    it('parseModule with namespaced package', () => {
        expect(parseModule('@a/b')).length(1).members(['@a/b']);
        expect(parseModule('@a/b/')).length(1).members(['@a/b']);
        expect(parseModule('@a/b/c')).length(2).members(['@a/b', 'c']);
        expect(parseModule('@a/b/c/')).length(2).members(['@a/b', 'c']);
        expect(parseModule('@a/b/c/d/e/f')).length(2).members(['@a/b', 'c/d/e/f']);
    });

    it('parseModule unexpected module name/format', () => {
        expect(() => parseModule('@a')).throw();
    });

    describe('isEsmOnlyModule', () => {
        let tempDir: string;

        beforeEach(() => {
            tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'theia-re-exports-test-'));
        });

        afterEach(() => {
            fs.rmSync(tempDir, { recursive: true, force: true });
        });

        function writePkg(pkgName: string, files: Record<string, string>): void {
            const pkgDir = path.join(tempDir, 'node_modules', pkgName);
            for (const [relPath, content] of Object.entries(files)) {
                const fullPath = path.join(pkgDir, relPath);
                fs.mkdirSync(path.dirname(fullPath), { recursive: true });
                fs.writeFileSync(fullPath, content, 'utf8');
            }
        }

        it('returns false for CommonJS packages', () => {
            writePkg('cjs-pkg', {
                'package.json': JSON.stringify({ name: 'cjs-pkg', main: 'index.js' }),
                'index.js': 'module.exports = {};'
            });
            expect(isEsmOnlyModule('cjs-pkg', tempDir)).to.be.false;
        });

        it('returns false for dual ESM/CJS packages with a require export condition', () => {
            writePkg('dual-pkg', {
                'package.json': JSON.stringify({
                    name: 'dual-pkg',
                    type: 'module',
                    exports: { '.': { import: './index.js', require: './index.cjs' } }
                }),
                'index.js': 'export default {};',
                'index.cjs': 'module.exports = {};'
            });
            expect(isEsmOnlyModule('dual-pkg', tempDir)).to.be.false;
        });

        it('returns true for ESM-only packages with type module and default export', () => {
            writePkg('esm-pkg', {
                'package.json': JSON.stringify({
                    name: 'esm-pkg',
                    type: 'module',
                    exports: { types: './index.d.ts', default: './index.js' }
                }),
                'index.js': 'export default class {};'
            });
            expect(isEsmOnlyModule('esm-pkg', tempDir)).to.be.true;
        });

        it('returns true for ESM-only packages with import-only exports', () => {
            writePkg('esm-import-only', {
                'package.json': JSON.stringify({
                    name: 'esm-import-only',
                    type: 'module',
                    exports: { '.': { import: './index.mjs' } }
                }),
                'index.mjs': 'export default {};'
            });
            expect(isEsmOnlyModule('esm-import-only', tempDir)).to.be.true;
        });

        it('returns true for copied ESM re-export stubs before exports map is refreshed', () => {
            writePkg('@scope/host', {
                'package.json': JSON.stringify({
                    name: '@scope/host',
                    type: 'module',
                    exports: { './shared/*': './shared/*/index.cjs' }
                }),
                'shared/esm-dep/index.js': "export * from 'esm-dep';\nexport { default } from 'esm-dep';\n"
            });
            expect(isEsmOnlyModule('@scope/host/shared/esm-dep', tempDir)).to.be.true;
        });

        it('does not match overlapping wildcard exports patterns when target is shorter than prefix + suffix', () => {
            writePkg('wildcard-pkg', {
                'package.json': JSON.stringify({
                    name: 'wildcard-pkg',
                    exports: {
                        './foo*foo': { import: './dist/foo*foo.mjs' }
                    }
                })
            });
            expect(isEsmOnlyModule('wildcard-pkg/foo', tempDir)).to.be.false;
            expect(isEsmOnlyModule('wildcard-pkg/foofoo', tempDir)).to.be.true;
            expect(isEsmOnlyModule('wildcard-pkg/foo-bar-foo', tempDir)).to.be.true;
        });

        it('isCommonJsModule preserves CJS classification for CJS, .cjs dual, and conditions-only exports (vscode-uri shape)', () => {
            writePkg('cjs-pkg', {
                'package.json': JSON.stringify({ name: 'cjs-pkg', main: 'index.js' }),
                'index.js': 'module.exports = {};'
            });
            writePkg('dual-cjs-ext', {
                'package.json': JSON.stringify({
                    name: 'dual-cjs-ext',
                    type: 'module',
                    exports: { '.': { import: './index.js', require: './index.cjs' } }
                }),
                'index.js': 'export default {};',
                'index.cjs': 'module.exports = {};'
            });
            writePkg('dual-subpath-pkg', {
                'package.json': JSON.stringify({
                    name: 'dual-subpath-pkg',
                    exports: { '.': { import: './index.mjs', require: './index.js' } }
                }),
                'index.mjs': 'export default {};',
                'index.js': 'module.exports = {};'
            });
            writePkg('conditions-only-dual', {
                'package.json': JSON.stringify({
                    name: 'conditions-only-dual',
                    main: './lib/umd/index.js',
                    exports: { import: './lib/esm/index.mjs', require: './lib/umd/index.js' }
                }),
                'lib/esm/index.mjs': 'export default {};',
                'lib/umd/index.js': 'module.exports = {};'
            });
            writePkg('esm-pkg', {
                'package.json': JSON.stringify({
                    name: 'esm-pkg',
                    type: 'module',
                    exports: { types: './index.d.ts', default: './index.js' }
                }),
                'index.js': 'export default class {};'
            });
            expect(isCommonJsModule('cjs-pkg', tempDir)).to.be.true;
            expect(isCommonJsModule('dual-cjs-ext', tempDir)).to.be.true;
            expect(isCommonJsModule('dual-subpath-pkg', tempDir)).to.be.false;
            expect(isCommonJsModule('conditions-only-dual', tempDir)).to.be.true;
            expect(isEsmOnlyModule('conditions-only-dual', tempDir)).to.be.false;
            expect(isCommonJsModule('esm-pkg', tempDir)).to.be.false;
        });
    });
});
