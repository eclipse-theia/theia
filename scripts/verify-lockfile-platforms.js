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

// Verify that package-lock.json still carries the `libc` fields on Linux
// optional-dep entries. npm strips these fields when the lockfile is
// regenerated on a host that does not consume them (e.g. glibc-only), and
// their absence breaks `npm ci` on Alpine and other musl-based images.
//
// Missing entries (whole packages dropped from the lockfile) are handled by
// scripts/npm-install-with-platforms.js on a normal regeneration, so this
// check focuses on the libc field specifically.
//
// Run in CI. If this fails, the fix is scripts/npm-install-with-platforms.js.

const path = require('path');
const fs = require('fs');

const lockPath = path.resolve(__dirname, '..', 'package-lock.json');
/** @type {{ packages?: Record<string, { libc?: string[] }> }} */
const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const packages = lock.packages || {};

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

const errors = [];

for (const { name, libc } of requiredLibc) {
    const entry = packages[`node_modules/${name}`];
    if (!entry) {
        errors.push(`missing entry: ${name}`);
        continue;
    }
    if (!Array.isArray(entry.libc) || !entry.libc.includes(libc)) {
        errors.push(`${name}: expected libc=[${libc}], got ${JSON.stringify(entry.libc)}`);
    }
}

if (errors.length > 0) {
    console.error('package-lock.json is missing libc fields on Linux entries:');
    for (const e of errors) {
        console.error(`  - ${e}`);
    }
    console.error('');
    console.error('Run: node scripts/npm-install-with-platforms.js');
    console.error('See: doc/lockfile-maintenance.md');
    process.exit(1);
}

console.log('package-lock.json libc coverage OK.');
