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

/*
 * Publishes the packages a failed `lerna publish` left out.
 *
 * Usage: node scripts/publish-missing.js --tag <dist-tag> [--published-log <file>] [--summary-file <file>] [--dry-run]
 *
 * A failed `lerna publish` leaves the versions it was publishing in the package.json files, for a
 * release as well as for a canary. This script publishes every public package whose version the
 * registry does not have yet, with `npm publish`, and continues with the next package if one fails.
 *
 * - `--published-log` is the output of the failed publish. Packages it reports as published count as
 *   published even if the registry does not list them yet: npm scans every new version for malware
 *   before releasing it, and publishing such a version again would only fail.
 * - `--summary-file` writes all packages and their versions in the format of `lerna publish
 *   --summary-file`, so that `check-publish.js` can verify the complete publish.
 * - `--dry-run` only reports what would be published.
 *
 * Unlike `lerna publish from-package`, this compares versions without their build metadata, which
 * the registry drops. Otherwise every canary version would count as missing and be signed again.
 */

const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const { fetchVersion } = require('./npm-registry');

/**
 * @param {string} name the name of the option
 * @returns {string | undefined} the value following the option, if given
 */
function option(name) {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] : undefined;
}

const tag = option('--tag');
const publishedLog = option('--published-log');
const summaryFile = option('--summary-file');
const dryRun = process.argv.includes('--dry-run');

publishMissing().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function publishMissing() {
    if (!tag) {
        throw new Error('--tag is required, e.g. `--tag next`');
    }
    const packages = readPackages();
    const accepted = readAccepted(publishedLog);

    const missing = [];
    for (const pck of packages) {
        if (accepted.has(`${pck.name}@${pck.version}`)) {
            continue;
        }
        let published;
        try {
            published = await fetchVersion(pck.name, pck.version);
        } catch (error) {
            // not conclusive, publishing it again is safe since npm rejects an existing version
            console.warn(`${pck.name}@${pck.version}: ${error.message}`);
        }
        if (!published) {
            missing.push(pck);
        }
    }

    if (summaryFile) {
        fs.writeFileSync(summaryFile, JSON.stringify(packages.map(pck => ({ packageName: pck.name, version: pck.version }))));
    }
    console.info(`${packages.length - missing.length} of ${packages.length} packages are published`);
    if (missing.length === 0) {
        return;
    }

    const failed = [];
    for (const pck of missing) {
        console.info(`Publishing ${pck.name}@${pck.version} with dist tag ${tag}${dryRun ? ' (dry run)' : ''}`);
        if (dryRun) {
            continue;
        }
        const result = cp.spawnSync('npm', ['publish', '--tag', tag], { cwd: pck.location, stdio: 'inherit' });
        if (result.status === 0) {
            // the same wording as lerna, so that the workflow can find every published package in one log
            console.info(`publish-missing success published ${pck.name} ${pck.version}`);
        } else {
            failed.push(pck);
        }
    }
    if (failed.length > 0) {
        console.error(`Failed to publish ${failed.length} package(s): ${failed.map(pck => `${pck.name}@${pck.version}`).join(', ')}`);
        process.exitCode = 1;
    }
}

/**
 * Collects every public package of the monorepo in the version of its package.json, without build metadata.
 *
 * @returns {{ name: string, version: string, location: string }[]}
 */
function readPackages() {
    const workspaces = JSON.parse(cp.execSync('npx lerna ls --json --loglevel=silent').toString());
    return workspaces.map(workspace => {
        const pck = JSON.parse(fs.readFileSync(path.resolve(workspace.location, 'package.json'), 'utf8'));
        return { name: pck.name, version: pck.version.split('+')[0], location: workspace.location };
    });
}

/**
 * Collects the packages a publish log reports as published, as `name@version` without build metadata.
 *
 * @param {string | undefined} log the path of the log, may not exist
 * @returns {Set<string>}
 */
function readAccepted(log) {
    const accepted = new Set();
    if (!log || !fs.existsSync(log)) {
        return accepted;
    }
    for (const line of fs.readFileSync(log, 'utf8').split(/\r?\n/)) {
        const match = /(?:lerna|publish-missing) success published (\S+) (\S+)/.exec(line);
        if (match) {
            accepted.add(`${match[1]}@${match[2].split('+')[0]}`);
        }
    }
    return accepted;
}
