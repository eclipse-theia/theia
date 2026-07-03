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

// Run `npm install` without losing platform-specific optional-dependency
// metadata.
//
// `npm install` prunes optional-dep entries and libc fields for platforms
// other than the host. This script:
//   1. Snapshots the current lockfile.
//   2. Runs `npm install --include=optional`.
//   3. Restores any platform-specific entries or libc fields that were in
//      the snapshot but got stripped by npm.
//
// Run this whenever you would otherwise run `npm install` and need the
// lockfile to remain valid for all supported platforms.
//
// See doc/lockfile-maintenance.md for background.

const cp = require('child_process');
const fs = require('fs');
const path = require('path');

const IS_WINDOWS = process.platform === 'win32';

/** Package name prefixes whose lockfile entries describe platform-specific
 *  optional binaries. Entries under these prefixes carry a `libc` field
 *  whose stripping we detect and restore in addition to whole-entry loss.
 *  Beyond these families, any entry marked `optional: true` in the baseline
 *  is also restored if it goes missing. */
const LIBC_FAMILIES = [
    'node_modules/@parcel/watcher-',
    'node_modules/@nx/nx-',
];

/** @param {string} key */
function hasLibcField(key) {
    return LIBC_FAMILIES.some(prefix => key.startsWith(prefix));
}

const repoRoot = path.resolve(__dirname, '..');
process.chdir(repoRoot);

const lockPath = path.join(repoRoot, 'package-lock.json');

/** @type {any} */
let baseline = null;
if (fs.existsSync(lockPath)) {
    baseline = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
} else {
    console.warn('No existing package-lock.json to snapshot; platform-specific entries added by npm may be incomplete.');
}

console.log('==> npm install --include=optional');
const install = cp.spawnSync('npm', ['install', '--include=optional'], {
    stdio: 'inherit',
    shell: IS_WINDOWS,
});
if (install.status !== 0) {
    process.exit(install.status || 1);
}

if (!baseline) {
    console.log('No baseline to restore from; done.');
    process.exit(0);
}

/** @type {any} */
const updated = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
const baselinePkgs = baseline.packages || {};
const updatedPkgs = updated.packages || {};

let restoredEntries = 0;
let restoredLibc = 0;

for (const key of Object.keys(baselinePkgs)) {
    const oldEntry = baselinePkgs[key];
    const newEntry = updatedPkgs[key];
    const wasOptional = oldEntry.optional === true;
    const libcFamily = hasLibcField(key);

    if (!newEntry) {
        // Entry disappeared. Restore if it was optional (npm may have pruned
        // it because it doesn't apply to the current host) or if it belongs
        // to a known libc-bearing family.
        if (wasOptional || libcFamily) {
            updatedPkgs[key] = oldEntry;
            restoredEntries++;
        }
        continue;
    }
    // libc field stripping only affects libc-bearing family entries.
    if (libcFamily && oldEntry.libc && !newEntry.libc && newEntry.version === oldEntry.version) {
        updatedPkgs[key] = oldEntry;
        restoredLibc++;
    }
}

if (restoredEntries === 0 && restoredLibc === 0) {
    console.log('No platform metadata was stripped.');
    process.exit(0);
}

// Do not re-sort `updated.packages`. Existing entries stay in the order
// npm produced. Restored missing entries end up at the end of the object,
// which npm will re-position on its next install; sorting them ourselves
// would use JavaScript's default comparator and disagree with npm's.
fs.writeFileSync(lockPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');

console.log(`Restored ${restoredEntries} missing platform entries and ${restoredLibc} stripped libc fields.`);
console.log('Verify with: node scripts/verify-lockfile-platforms.js');
