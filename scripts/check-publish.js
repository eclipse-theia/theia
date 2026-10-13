// *****************************************************************************
// Copyright (C) 2019 TypeFox and others
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
const chalk = require('chalk');
const cp = require('child_process');
const fs = require('fs');
const { fetchVersion } = require('./npm-registry');

/*
 * Usage: node scripts/check-publish.js [--summary-file <path>]
 *
 * With `--summary-file`, checks exactly the packages and versions of the summary that
 * `lerna publish --summary-file` writes, which also covers canary versions. Without it, or if the
 * file does not exist because the publish did not complete, checks every public package in the
 * version of `lerna.json`.
 */
const summaryFileIndex = process.argv.indexOf('--summary-file');
const summaryFile = summaryFileIndex >= 0 ? process.argv[summaryFileIndex + 1] : undefined;

/**
 * How long to wait for packages that are not available yet, in milliseconds.
 * npm scans every new version for malware before it releases it, and until then answers 404 for
 * it. The scan typically takes about five minutes and can take more than fifteen.
 */
const timeout = 30 * 60 * 1000;

/** The delay between two lookups of the packages that are not available yet, in milliseconds. */
const interval = 30 * 1000;

checkPublish(summaryFile).catch(error => {
    console.error(error);
    process.exitCode = 1;
});

/**
 * @param {string | undefined} summaryFile the path of the summary of `lerna publish --summary-file`
 */
async function checkPublish(summaryFile) {
    const specs = summaryFile && fs.existsSync(summaryFile) ? readSummary(summaryFile) : await readWorkspaces(summaryFile);

    if (specs.length === 0) {
        console.info('No packages to check');
        return;
    }

    const start = Date.now();
    let pending = specs;
    while (true) {
        const versions = await Promise.all(pending.map(spec => fetchVersion(spec.name, spec.version).catch(error => {
            // a transient registry error is not conclusive, try again in the next round
            console.warn(`${spec.name}@${spec.version}: ${error.message}`);
            return undefined;
        })));
        pending.forEach((spec, index) => {
            if (versions[index]) {
                console.info(`${spec.name}@${spec.version}: published`);
            }
        });
        pending = pending.filter((_, index) => !versions[index]);

        const elapsed = Date.now() - start;
        if (pending.length === 0 || elapsed + interval > timeout) {
            break;
        }
        console.info(`${pending.length} package(s) not available yet, most likely npm is still scanning them. `
            + `Checking again in ${interval / 1000}s (${Math.round(elapsed / 60000)} of ${timeout / 60000} minutes elapsed): `
            + pending.map(spec => spec.name).join(', '));
        await new Promise(resolve => setTimeout(resolve, interval));
    }

    for (const spec of pending) {
        console.error(`(${chalk.red('ERR')}) ${spec.name}@${spec.version}: ${chalk.red('NOT')} published`);
    }
    if (pending.length > 0) {
        console.error(`(${chalk.red('ERR')}) ${pending.length} package(s) not available after ${timeout / 60000} minutes. `
            + 'If lerna reported them as published, npm is still scanning them: do not republish them, '
            + 'wait or contact npm support.');
        process.exitCode = 1;
        if (process.env.GITHUB_ACTIONS) {
            console.log(`::warning::${pending.length} package(s) not available on npm yet, most likely still being scanned: `
                + pending.map(spec => `${spec.name}@${spec.version}`).join(', '));
        }
    }
    writeSummary(specs.length, pending);
}

/**
 * Reads the packages `lerna publish --summary-file` reports as published.
 *
 * @param {string} summaryFile the path of the summary
 * @returns {{ name: string, version: string }[]}
 */
function readSummary(summaryFile) {
    /** @type {{ packageName: string, version: string }[]} */
    const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    // the registry drops build metadata, e.g. the commit of a canary version
    return summary.map(entry => ({ name: entry.packageName, version: entry.version.split('+')[0] }));
}

/**
 * Collects every public package of the monorepo in the version of `lerna.json`.
 *
 * @param {string | undefined} summaryFile the path of the summary that was asked for but does not exist
 * @returns {Promise<{ name: string, version: string }[]>}
 */
async function readWorkspaces(summaryFile) {
    const workspaces = JSON.parse(cp.execSync('npx lerna ls --json --loglevel=silent').toString());
    const newVersion = JSON.parse(await fs.promises.readFile(path.resolve('lerna.json'), 'utf8')).version;
    if (summaryFile) {
        console.info(`${summaryFile} does not exist, the publish did not complete. Checking all packages for ${newVersion}`);
    }

    const specs = [];
    for (const workspace of workspaces) {
        const pck = JSON.parse(await fs.promises.readFile(path.resolve(workspace.location, 'package.json'), 'utf8'));
        if (!pck.private) {
            specs.push({ name: pck.name, version: newVersion });
        }
    }
    return specs;
}

/**
 * Appends the result to the GitHub Actions job summary, when running in GitHub Actions.
 *
 * @param {number} total the number of packages checked
 * @param {{ name: string, version: string }[]} pending the packages that are not available
 */
function writeSummary(total, pending) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath) {
        return;
    }
    const lines = ['## npm publication', ''];
    if (pending.length === 0) {
        lines.push(`All ${total} packages are available on npm.`);
    } else {
        lines.push(`${total - pending.length} of ${total} packages are available on npm after ${timeout / 60000} minutes.`, '',
            'If the publish step succeeded, npm accepted the others and is most likely still scanning them. '
            + 'Do not republish them. Wait, and contact npm support if they stay unavailable.', '',
            ...pending.map(spec => `- \`${spec.name}@${spec.version}\``));
    }
    fs.appendFileSync(summaryPath, lines.join('\n') + '\n');
}
