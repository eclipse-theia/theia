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

/**
 * Checks the mirrored Copilot SDK types of `@theia/ai-copilot` against a released
 * `@github/copilot-sdk`, which is deliberately not a dependency of this repository, see
 * `packages/ai-copilot/src/node/copilot-sdk-types.ts`.
 *
 * The SDK is installed into a temporary directory, never into this repository, and `check.ts` is
 * compiled against it. Optional dependencies are skipped, so the Copilot CLI binary is not downloaded.
 *
 * Usage: `node scripts/copilot-sdk-mirror/run.js [version]`, `latest` by default.
 *
 * Exit codes: 0 when the mirror still matches, 1 when it drifted, 2 when the check could not run.
 */

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PACKAGE = '@github/copilot-sdk';
const repoRoot = path.resolve(__dirname, '..', '..');
const mirrorFile = path.join(repoRoot, 'packages', 'ai-copilot', 'src', 'node', 'copilot-sdk-types.ts');
const checkFile = path.join(__dirname, 'check.ts');

/** The version the mirror records, so that a drift can name both sides. */
function mirroredVersion() {
    const header = fs.readFileSync(mirrorFile, 'utf8');
    const match = header.match(/Mirrored from `@github\/copilot-sdk` (\d+\.\d+\.\d+)/);
    if (!match) {
        fail(`Could not read the mirrored version from ${path.relative(repoRoot, mirrorFile)}.`);
    }
    return match[1];
}

/** @param {string} message */
function fail(message) {
    console.error(message);
    process.exit(2);
}

/** @param {string} command @param {string[]} args @param {string} [cwd] */
function run(command, args, cwd) {
    return cp.execFileSync(command, args, {
        cwd: cwd ?? repoRoot,
        encoding: 'utf8',
        shell: process.platform === 'win32'
    });
}

/**
 * Installs the SDK on its own, without its optional platform binaries and without touching this
 * repository, and returns the directory it went into.
 * @param {string} version
 */
function installSdk(version) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'theia-copilot-sdk-mirror-'));
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: 'copilot-sdk-mirror-check', private: true }));
    run('npm', ['install', '--prefix', directory, '--no-save', '--no-package-lock', '--omit=optional', '--ignore-scripts', `${PACKAGE}@${version}`]);
    return directory;
}

/**
 * Compiles the assertions of `check.ts` against the SDK in the given directory.
 * @param {string} directory
 * @returns {{ ok: boolean, output: string }}
 */
function typeCheck(directory) {
    const modules = path.join(directory, 'node_modules');
    const tsconfig = path.join(directory, 'tsconfig.json');
    fs.writeFileSync(tsconfig, JSON.stringify({
        compilerOptions: {
            target: 'ES2023',
            lib: ['ES2023'],
            module: 'CommonJS',
            moduleResolution: 'node',
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            types: [],
            baseUrl: modules,
            paths: { '*': ['*'] }
        },
        files: [checkFile, mirrorFile]
    }, undefined, 2));
    try {
        run('npx', ['tsc', '-p', tsconfig]);
        return { ok: true, output: '' };
    } catch (error) {
        return { ok: false, output: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim() };
    }
}

const requested = process.argv[2] ?? 'latest';
const mirrored = mirroredVersion();

let directory;
try {
    directory = installSdk(requested);
} catch (error) {
    fail(`Could not install ${PACKAGE}@${requested}: ${error.message}`);
}

try {
    const installed = require(path.join(directory, 'node_modules', PACKAGE, 'package.json')).version;
    console.log(`Mirror records ${PACKAGE} ${mirrored}, checking against ${installed}.`);

    const { ok, output } = typeCheck(directory);
    if (!ok) {
        console.error(`\nThe mirrored types no longer match ${PACKAGE} ${installed}:\n\n${output}\n`);
        console.error(`Update ${path.relative(repoRoot, mirrorFile)}, including the version in its header, and adjust`);
        console.error('the code that uses the changed members.');
        process.exit(1);
    }

    console.log(installed === mirrored
        ? 'The mirrored types match.'
        : `The mirrored types still match, but they were taken from ${mirrored}. Consider recording ${installed} in the header.`);
} finally {
    fs.rmSync(directory, { recursive: true, force: true });
}
