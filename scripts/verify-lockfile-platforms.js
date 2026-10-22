// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others
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

// Verify two properties of the committed package-lock.json:
//
// 1. It still carries the `libc` fields on Linux optional-dep entries. Their
//    absence breaks `npm ci` on Alpine and other musl-based images. npm 10,
//    which shipped with the no longer supported Node 22, stripped them when the
//    lockfile was regenerated on a host that does not consume them (e.g.
//    glibc-only); npm 11.19, bundled with both supported Node versions, keeps
//    them. This guards against a globally installed older npm.
//    If this fails, regenerate the lockfile with the npm bundled with a
//    supported Node version.
//
// 2. Every dependency with an install script is listed in the root
//    `allowScripts` allowlist. npm 11 only prints a notice for an unlisted
//    dependency and still runs its script, but `--strict-allow-scripts` makes
//    it fatal and npm 12 is expected to default to that, so an unlisted
//    dependency would stop building its native bindings.
//    If this fails, the fix is to add the package to `allowScripts` in
//    package.json with `true` (script is needed) or `false` (script is
//    cosmetic or unused).
//
// Run in CI. See doc/lockfile-maintenance.md.

const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const lockPath = path.join(root, 'package-lock.json');
/** @type {{ packages?: Record<string, { libc?: string[], hasInstallScript?: boolean }> }} */
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages || {};

/** @type {{ allowScripts?: Record<string, boolean> }} */
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const allowScripts = rootPackage.allowScripts || {};

/** Entries that must carry the given `libc` value. */
const requiredLibc = [
    { name: '@nx/nx-linux-arm64-gnu',            libc: 'glibc' },
    { name: '@nx/nx-linux-arm64-musl',           libc: 'musl'  },
    { name: '@nx/nx-linux-x64-gnu',              libc: 'glibc' },
    { name: '@nx/nx-linux-x64-musl',             libc: 'musl'  },
    { name: '@parcel/watcher-linux-arm-glibc',   libc: 'glibc' },
    { name: '@parcel/watcher-linux-arm-musl',    libc: 'musl'  },
    { name: '@parcel/watcher-linux-arm64-glibc', libc: 'glibc' },
    { name: '@parcel/watcher-linux-arm64-musl',  libc: 'musl'  },
    { name: '@parcel/watcher-linux-x64-glibc',   libc: 'glibc' },
    { name: '@parcel/watcher-linux-x64-musl',    libc: 'musl'  },
];

const libcErrors = [];

for (const { name, libc } of requiredLibc) {
    const entry = packages[`node_modules/${name}`];
    if (!entry) {
        libcErrors.push(`missing entry: ${name}`);
        continue;
    }
    if (!Array.isArray(entry.libc) || !entry.libc.includes(libc)) {
        libcErrors.push(`${name}: expected libc=[${libc}], got ${JSON.stringify(entry.libc)}`);
    }
}

/**
 * Names of all dependencies in the lockfile that declare an install script.
 * Workspace entries (the root package and `dev-packages/*`) are excluded: their
 * lifecycle scripts are part of this repository and always run.
 */
const installScriptDependencies = new Set();
const nodeModules = 'node_modules/';
for (const [location, entry] of Object.entries(packages)) {
    if (!entry.hasInstallScript) {
        continue;
    }
    const index = location.lastIndexOf(nodeModules);
    if (index < 0) {
        continue;
    }
    installScriptDependencies.add(location.slice(index + nodeModules.length));
}

const unlisted = [...installScriptDependencies].filter(name => !(name in allowScripts)).sort();
const stale = Object.keys(allowScripts).filter(name => !installScriptDependencies.has(name)).sort();

if (libcErrors.length > 0) {
    console.error('package-lock.json is missing libc fields on Linux entries:');
    for (const e of libcErrors) {
        console.error(`  - ${e}`);
    }
    console.error('');
    console.error('Regenerate it with the npm bundled with a supported Node version.');
}

if (unlisted.length > 0) {
    console.error('Dependencies with install scripts are missing from `allowScripts` in package.json:');
    for (const name of unlisted) {
        console.error(`  - ${name}`);
    }
    console.error('');
    console.error('Add each one with `true` if the script is required (e.g. native bindings)');
    console.error('or `false` if it is cosmetic or unused.');
}

if (stale.length > 0) {
    console.error('`allowScripts` in package.json lists packages that no longer have install scripts:');
    for (const name of stale) {
        console.error(`  - ${name}`);
    }
    console.error('');
    console.error('Remove these entries.');
}

if (libcErrors.length > 0 || unlisted.length > 0 || stale.length > 0) {
    console.error('See: doc/lockfile-maintenance.md');
    process.exit(1);
}

console.log('package-lock.json libc coverage OK.');
console.log('`allowScripts` covers all dependencies with install scripts.');
