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

const assert = require('assert');
const fs = require('fs');
const { derivePackageName, MalformedPackageJsonError } = require('./package-json');
const { tempFiles } = require('./test/temp-files');

/**
 * Stand-in for the Theia monorepo, covering the package layouts which have to be told apart.
 */
const repo = tempFiles({
    'package.json': '{ "name": "@theia/monorepo" }',
    // The directory 'ai-hugging-face' contains the package '@theia/ai-huggingface'.
    'packages/ai-hugging-face/package.json': '{ "name": "@theia/ai-huggingface" }',
    // The directory 'private-eslint-plugin' contains the package '@theia/eslint-plugin'.
    'dev-packages/private-eslint-plugin/package.json': '{ "name": "@theia/eslint-plugin" }',
    'packages/nameless/package.json': '{ "version": "1.0.0" }',
    'examples/browser-only/package.json': '{ "name": "@theia/example-browser-only" }',
    'mypackages/foo/package.json': '{ "name": "@theia/foo" }'
});
after(() => repo.dispose());

describe('derivePackageName', () => {
    it('prefers the package.json name over the directory name', () => {
        assert.strictEqual(derivePackageName(repo.resolve('packages/ai-hugging-face/src/browser/foo.ts')), 'ai-huggingface');
        assert.strictEqual(derivePackageName(repo.resolve('dev-packages/private-eslint-plugin/rules/foo.js')), 'eslint-plugin');
    });

    it('reads the innermost package.json when an outer directory is called "packages" too', () => {
        const nested = tempFiles({
            'packages/outer/package.json': '{ "name": "@theia/outer" }',
            'packages/outer/packages/inner/package.json': '{ "name": "@theia/inner" }'
        });
        try {
            assert.strictEqual(derivePackageName(nested.resolve('packages/outer/packages/inner/src/foo.ts')), 'inner');
        } finally {
            nested.dispose();
        }
    });

    it('ignores a checkout below a directory called "packages"', () => {
        const nested = tempFiles({
            'packages/theia/package.json': '{ "name": "@theia/monorepo" }',
            'packages/theia/examples/browser-only/package.json': '{ "name": "@theia/example-browser-only" }'
        });
        try {
            assert.strictEqual(derivePackageName(nested.resolve('packages/theia/examples/browser-only/src/foo.ts')), undefined);
        } finally {
            nested.dispose();
        }
    });

    it('falls back to the directory name if the package.json has no name', () => {
        assert.strictEqual(derivePackageName(repo.resolve('packages/nameless/src/foo.ts')), 'nameless');
    });

    it('returns undefined outside of packages and dev-packages', () => {
        assert.strictEqual(derivePackageName(repo.resolve('examples/browser-only/src/foo.ts')), undefined);
        assert.strictEqual(derivePackageName(repo.resolve('mypackages/foo/src/bar.ts')), undefined);
        assert.strictEqual(derivePackageName(repo.resolve('doc/foo.ts')), undefined);
    });

    it('throws if the package.json cannot be parsed', () => {
        const broken = tempFiles({ 'packages/broken/package.json': '{ "name": ' });
        try {
            assert.throws(() => derivePackageName(broken.resolve('packages/broken/src/broken-class.ts')), MalformedPackageJsonError);
        } finally {
            broken.dispose();
        }
    });

    // The cache is validated against modification time and size, so the rewritten contents below
    // differ in length from the originals to keep these tests independent of the clock resolution.
    it('picks up a renamed package', () => {
        const renamed = tempFiles({ 'packages/before/package.json': '{ "name": "@theia/before" }' });
        try {
            assert.strictEqual(derivePackageName(renamed.resolve('packages/before/src/foo.ts')), 'before');
            fs.writeFileSync(renamed.resolve('packages/before/package.json'), '{ "name": "@theia/after-the-rename" }');
            assert.strictEqual(derivePackageName(renamed.resolve('packages/before/src/foo.ts')), 'after-the-rename');
        } finally {
            renamed.dispose();
        }
    });

    it('recovers once a malformed package.json is repaired', () => {
        const repaired = tempFiles({ 'packages/repaired/package.json': '{ "name": ' });
        try {
            assert.throws(() => derivePackageName(repaired.resolve('packages/repaired/src/foo.ts')), MalformedPackageJsonError);
            fs.writeFileSync(repaired.resolve('packages/repaired/package.json'), '{ "name": "@theia/repaired" }');
            assert.strictEqual(derivePackageName(repaired.resolve('packages/repaired/src/foo.ts')), 'repaired');
        } finally {
            repaired.dispose();
        }
    });
});
