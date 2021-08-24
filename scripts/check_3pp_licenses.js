/********************************************************************************
 * Copyright (c) 2021 Ericsson and others
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/
// @ts-check

const cp = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const licenseToolJar = path.resolve(__dirname, 'download/license.jar');
const licenseToolSummary = path.resolve(__dirname, '../license-check-summary.txt');
const licenseToolBaseline = path.resolve(__dirname, '../license-check-baseline.json');
const licenseToolUrl = 'https://repo.eclipse.org/service/local/artifact/maven/redirect?r=dash-licenses&g=org.eclipse.dash&a=org.eclipse.dash.licenses&v=LATEST';

main().catch(error => {
    console.error(error);
    process.exit(1);
});

async function main() {
    if (!fs.existsSync(licenseToolJar)) {
        console.warn('Fetching dash-licenses...');
        fs.mkdirSync(path.dirname(licenseToolJar), { recursive: true });
        exitOnChildError(spawn(
            'curl', ['-L', licenseToolUrl, '-o', licenseToolJar],
        ));
    }
    if (fs.existsSync(licenseToolSummary)) {
        console.warn('Backing up previous summary...')
        fs.renameSync(licenseToolSummary, `${licenseToolSummary}.old`);
    }
    console.warn('Running dash-licenses...');
    const dashStatus = spawn(
        'java', ['-jar', licenseToolJar, 'yarn.lock', '-batch', '50', '-timeout', '240', '-summary', licenseToolSummary],
        { stdio: ['ignore', 'ignore', 'inherit'] },
    );
    const error = getChildError(dashStatus);
    if (error) {
        console.error(error);
    }
    const restricted = await readSummaryRestricted(licenseToolSummary);
    if (restricted.length > 0) {
        if (fs.existsSync(licenseToolBaseline)) {
            console.warn('Checking results against the baseline...');
            const baseline = readBaseline(licenseToolBaseline);
            const unhandled = restricted.filter(entry => !baseline.has(entry.entry));
            if (unhandled.length > 0) {
                console.error(`ERROR: Found results that aren't part of the baseline!\n`);
                logRestrictedDependencies(unhandled);
                process.exit(1);
            }
        } else {
            console.error(`ERROR: Found unhandled restricted dependencies!\n`);
            logRestrictedDependencies(restricted);
            process.exit(1);
        }
    }
    console.warn('Done.');
    process.exit(0);
}

/**
 * @param {DashSummaryEntry[]} restricted list of restricted entries to log.
 * @return {void}
 */
function logRestrictedDependencies(restricted) {
    for (const { entry, license } of restricted) {
        console.log(`${entry}, ${license}`);
    }
}

/**
 * @param {string} summary path to the summary file.
 * @returns {Promise<DashSummaryEntry[]>} list of restriced dependencies.
 */
async function readSummaryRestricted(summary) {
    const restricted = [];
    await readSummary(summary, entry => {
        if (entry.status.toLocaleLowerCase() === 'restricted') {
            restricted.push(entry);
        }
    });
    return restricted.sort();
}

/**
 * Read each entry from dash's summary file and collect non-ignored restricted entries.
 * This is essentially a cheap CSV parser.
 * @param {string} summary path to the summary file.
 * @param {(line: DashSummaryEntry) => void} callback
 * @returns {Promise<void>} reading completed.
 */
async function readSummary(summary, callback) {
    return new Promise((resolve, reject) => {
        // Read each entry from dash's summary file and collect non-ignored restricted entries.
        // This is essentially a cheap CSV parser.
        readline.createInterface(fs.createReadStream(summary).on('error', reject))
            .on('line', line => {
                const [entry, license, status, source] = line.split(', ');
                callback({ entry, license, status, source });
            })
            .on('close', resolve);
    });
}

/**
 * Handle both list and object format for the baseline json file.
 * @param {string} baseline path to the baseline json file.
 * @returns {Set<string>} set of ignored restricted dependencies.
 */
function readBaseline(baseline) {
    const json = JSON.parse(fs.readFileSync(baseline, 'utf8'));
    if (Array.isArray(json)) {
        return new Set(json);
    } else if (typeof json === 'object' && json !== null) {
        return new Set(Object.keys(json));
    }
    console.error(`ERROR: Invalid format for "${baseline}"`);
    process.exit(1);
}

/**
 * Spawn a process. Exits with code 1 on spawn error (e.g. file not found).
 * @param {string} bin
 * @param {string[]} args
 * @param {import('child_process').SpawnSyncOptions} [opts]
 * @returns {import('child_process').SpawnSyncReturns}
 */
function spawn(bin, args, opts = {}) {
    opts = { stdio: 'inherit', ...opts };
    /** @type {any} */
    const status = cp.spawnSync(bin, args, opts);
    // Add useful fields to the returned status object:
    status.bin = bin;
    status.args = args;
    status.opts = opts;
    // Abort on spawn error:
    if (status.error) {
        console.error(status.error);
        process.exit(1);
    }
    return status;
}

/**
 * @returns {string | undefined} Error message if the process errored, `undefined` otherwise.
 */
function getChildError(status) {
    if (typeof status.signal === 'string') {
        return `Command ${prettyCommand(status)} exited with signal: ${status.signal}`;
    } else if (status.status !== 0) {
        return `Command ${prettyCommand(status)} exited with code: ${status.status}`;
    }
}

/**
 * @param {any} status
 * @returns {string} Pretty command with both bin and args as stringified JSON.
 */
function prettyCommand(status, indent = 2) {
    return JSON.stringify([status.bin, ...status.args], undefined, indent);
}

/**
 * Exits with code 1 if `status` errored.
 * @returns {import('child_process').SpawnSyncReturns}
 */
function exitOnChildError(status) {
    const error = getChildError(status);
    if (error) {
        console.error(error);
        process.exit(1);
    }
    return status;
}

/**
 * @typedef {object} DashSummaryEntry
 * @property {string} entry
 * @property {string} license
 * @property {string} status
 * @property {string} source
 */
