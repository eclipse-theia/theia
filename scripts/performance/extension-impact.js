// *****************************************************************************
// Copyright (C) 2021 STMicroelectronics and others.
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
const { execSync, exec } = require('child_process');
const { EOL } = require('os');
const { copyFileSync, readdirSync, writeFileSync, appendFileSync, unlinkSync, readFileSync, rmdirSync } = require('fs');
const { ensureFileSync } = require('fs-extra');
const mkdirp = require('mkdirp');
const path = require('path');
const env = Object.assign({}, process.env);
env.PATH = path.resolve("../../node_modules/.bin") + path.delimiter + env.PATH;
let basePackage;
const { exit } = require('process');
let runs = 10;
let baseTime;
let extensions = [];
let yarn = false;
let url;
let workspace;
let file = path.resolve('./script.csv');
let detailFile;
let hostApp = 'browser';
let cancelled = false;

function sigintHandler() {
    if (cancelled) {
        // Second Ctrl+C: the first one is still unwinding, force-quit now.
        process.exit(130);
    }
    cancelled = true;
    console.error('\nInterrupted — aborting at the next safe point. Press Ctrl+C again to force-quit.');
    process.exit(130);
}

async function exitHandler() {
    cleanWorkspace();
    printFile();
}

(async () => {
    process.on('SIGINT', sigintHandler);
    process.on('exit', exitHandler);

    const yargs = require('yargs');
    const args = yargs(process.argv.slice(2))
        .option('base-time', {
            alias: 'b',
            desc: 'Pass an existing mean of the base application',
            type: 'number'
        })
        .option('runs', {
            alias: 'r',
            desc: 'The number of runs to measure',
            type: 'number',
            default: 10
        })
        .option('extensions', {
            alias: 'e',
            desc: `An array of extensions to test (defaults to the extensions in the packages folder).
                - Each entry must have this format: {name}:{version}
                - Entries are separated by whitespaces
                - Example: --extensions @theia/core:1.18.0 @theia/keymaps:1.18.0`,
            type: 'array'
        })
        .option('yarn', {
            alias: 'y',
            desc: 'Build all typescript sources on script start',
            type: 'boolean',
            default: false
        }).option('url', {
            alias: 'u',
            desc: 'Specify a custom URL at which to launch Theia in the browser (e.g. with a specific workspace)',
            type: 'string'
        }).option('workspace', {
            alias: 'w',
            desc: 'Specify an absolute path to a workspace on which to launch Theia in Electron',
            type: 'string'
        }).option('file', {
            alias: 'f',
            desc: 'Specify the relative path to a CSV file which stores the result',
            type: 'string',
            default: file
        }).option('detail-file', {
            alias: 'd',
            desc: 'Relative path to a CSV file for per-contribution breakdowns (default: <file>-details.csv, derived from --file)',
            type: 'string'
        }).option('app', {
            alias: 'a',
            desc: 'Specify in which application to run the tests',
            type: 'string',
            choices: ['browser', 'electron'],
            default: 'browser'
        }).wrap(Math.min(120, yargs.terminalWidth())).argv;
    if (args.baseTime) {
        baseTime = parseFloat(args.baseTime.toString()).toFixed(3);
    }
    if (args.extensions) {
        extensions = args.extensions;
    }
    if (args.runs) {
        runs = parseInt(args.runs.toString());
        if (runs < 2) {
            console.error('--runs must be at least 2');
            return;
        }
    }
    if (args.yarn) {
        yarn = true;
    }
    if (args.url) {
        url = args.url;
    }
    if (args.workspace) {
        workspace = args.workspace;
    }
    if (args.file) {
        file = path.resolve(args.file);
        if (!file.endsWith('.csv')) {
            console.error('--file must end with .csv');
            return;
        }
    }
    if (args.detailFile) {
        detailFile = path.resolve(args.detailFile.toString());
        if (!detailFile.endsWith('.csv')) {
            console.error('--detail-file must end with .csv');
            return;
        }
    } else {
        detailFile = file.replace(/\.csv$/, '-details.csv');
    }
    if (args.app) {
        hostApp = args.app;
    }

    preparePackageTemplate();
    prepareWorkspace();
    if (yarn) {
        execSync('npm run build', { cwd: '../../', stdio: 'pipe' });
    }
    await extensionImpact(extensions);
})();

async function extensionImpact(extensions) {
    logToFile(`Extension Name, Mean (${runs} runs) (in s), Std Dev (in s), CV (%), Delta (in s)`);
    logToDetailFile(`Extension Name, Metric, Mean (${runs} runs) (in s), Std Dev (in s), CV (%)`);
    if (baseTime === undefined) {
        await calculateExtension(undefined);
    } else {
        log(`Base Theia (provided), ${baseTime}, -, -, -`);
    }

    if (extensions.length < 1) {
        extensions = await getExtensionsFromPackagesDir();
    }

    for (const e of extensions) {
        if (cancelled) {
            break;
        }
        await calculateExtension(e);
    }
}

function preparePackageTemplate() {
    const core = require('../../packages/core/package.json');
    const version = core.version;
    const content = readFileSync(path.resolve(__dirname, './base-package.json'), 'utf-8')
        .replace(/\{\{app\}\}/g, hostApp)
        .replace(/\{\{version\}\}/g, version);
    basePackage = JSON.parse(content);
    if (hostApp === 'electron') {
        basePackage.dependencies['@theia/electron'] = version;
        // ApplicationPackageManager.prepareElectron() (in @theia/cli) requires `electron` to
        // be declared as a devDependency with a range that satisfies @theia/electron's peer.
        // Without it, `theia build` auto-patches package.json and aborts with
        // `Updated dependencies, please run "install" again`, which fails every iteration.
        const { electronRange } = require('@theia/electron');
        basePackage.devDependencies = basePackage.devDependencies ?? {};
        basePackage.devDependencies.electron = electronRange;
    }
    return basePackage;
}

function prepareWorkspace() {
    copyFileSync(`../../examples/${hostApp}/package.json`, './backup-package.json');
    mkdirp('../../noPlugins', function (err) {
        if (err) {
            console.error(err);
        }
    });
    mkdirp('./theia-config-dir', function (err) {
        if (err) {
            console.error(err);
        }
    });
    ensureFileSync(file);
    writeFileSync(file, '');
    ensureFileSync(detailFile);
    writeFileSync(detailFile, '');
}

function cleanWorkspace() {
    copyFileSync('./backup-package.json', `../../examples/${hostApp}/package.json`);
    unlinkSync('./backup-package.json');
    rmdirSync('../../noPlugins');
    rmdirSync('./theia-config-dir');
}

async function getExtensionsFromPackagesDir() {
    const directories = readdirSync('../../packages', { withFileTypes: true })
        .filter(dir => dir.isDirectory() && dir.name !== 'core')
        .map(dir => dir.name);

    return directories.map(directory => {
        const name = `"${require(`../../packages/${directory}/package.json`).name}"`;
        const version = `"${require(`../../packages/${directory}/package.json`).version}"`;
        return name + ': ' + version;
    });
}

async function calculateExtension(extensionQualifier) {
    if (cancelled) {
        return;
    }
    const basePackageCopy = { ...basePackage };
    basePackageCopy.dependencies = { ...basePackageCopy.dependencies };
    if (extensionQualifier !== undefined) {
        const qualifier = extensionQualifier.replace(/"/g, '');
        const name = qualifier.substring(0, qualifier.lastIndexOf(':'));
        const version = qualifier.substring(qualifier.lastIndexOf(':') + 1);
        basePackageCopy.dependencies[name] = version;
    } else {
        extensionQualifier = "Base Theia";
    }
    logToConsole(`Building the ${hostApp} example with ${extensionQualifier}.`);
    writeFileSync(`../../examples/${hostApp}/package.json`, JSON.stringify(basePackageCopy, null, 2));
    try {
        execSync(`npm run build:${hostApp}`, { cwd: '../../', stdio: 'pipe' });

        // Rebuild native modules if necessary
        execSync(`npm run rebuild:${hostApp}`, { cwd: '../../', stdio: 'pipe' });
    } catch (error) {
        // execSync installs a temporary signal forwarder that consumes SIGINT/SIGTERM
        // (routing them to the child), so our own SIGINT listener never fires during a
        // blocking build. Detect a signal-killed child by inspecting error.signal and
        // trigger cancellation manually.
        if (cancelled || error.signal === 'SIGINT' || error.signal === 'SIGTERM') {
            sigintHandler();
            return;
        }
        const stdout = error.stdout?.toString() ?? '';
        const stderr = error.stderr?.toString() ?? '';
        if (stdout) { console.error(stdout); }
        if (stderr) { console.error(stderr); }
        if (!stdout && !stderr) { console.error(error.message); }
        log(`${extensionQualifier}, Error while building the package.json, -, -, -`);
        return;
    }

    logToConsole(`Measuring the startup time with ${extensionQualifier} ${runs} times. This may take a while.`);
    const appCommand = (app) => {
        let command;
        let cwd;
        switch (app) {
            case 'browser':
                command = `concurrently --success first -k -r "cd scripts/performance && node browser-performance.js --name Browser --folder browser --runs ${runs}${url ? ' --url ' + url : ''}" `
                    + `"npm run start:browser | grep -v '.*'"`
                cwd = path.resolve(__dirname, '../../');
                break;
            case 'electron':
                command = `node electron-performance.js  --name Electron --folder electron --runs ${runs}${workspace ? ' --workspace "' + workspace + '"' : ''}`
                cwd = __dirname;
                break;
            default:
                console.log('Unknown host app:', hostApp);
                exit(1);
                break; // Unreachable
        }
        return [command, cwd];
    };
    const [command, cwd] = appCommand(hostApp);
    const output = await execCommand(command, { env: env, cwd: cwd, shell: true });
    if (cancelled) {
        return;
    }

    const mean = parseFloat(getMeasurement(output, '[MEAN] Largest Contentful Paint (LCP):'));
    const stdev = parseFloat(getMeasurement(output, '[STDEV] Largest Contentful Paint (LCP):'));

    if (isNaN(mean) || isNaN(stdev)) {
        log(`${extensionQualifier}, Error while measuring with this extension, -, -, -`);
    } else {
        const cv = ((stdev / mean) * 100).toFixed(3);
        let diff;
        if (baseTime === undefined) {
            diff = '-';
            baseTime = mean;
        } else {
            diff = (mean - baseTime).toFixed(3);
        }
        log(`${extensionQualifier}, ${mean.toFixed(3)}, ${stdev.toFixed(3)}, ${cv}, ${diff}`);
    }

    // Emit per-metric breakdowns (everything except the LCP that's already in the main CSV).
    for (const metric of parseAllMetrics(output)) {
        if (metric.scenario === 'Largest Contentful Paint (LCP)') {
            continue;
        }
        const metricCv = metric.mean > 0 ? ((metric.stdev / metric.mean) * 100).toFixed(3) : '-';
        logToDetailFile(`${extensionQualifier}, ${metric.scenario}, ${metric.mean.toFixed(3)}, ${metric.stdev.toFixed(3)}, ${metricCv}`);
    }
}

async function execCommand(command, args) {
    return new Promise((resolve) => {
        let output = '';
        const childProcess = exec(command, args);
        childProcess.stdout.on('data', function (out) {
            output += out.toString();
            console.log(out.toString().trim());
        });

        childProcess.stderr.on('data', function (error) {
            console.log(error.toString());
        });

        childProcess.on('close', function () {
            resolve(output);
        });

        childProcess.on('exit', function () {
            resolve(output);
        })
    });
}

function getMeasurement(output, identifier) {
    const firstIndex = output.lastIndexOf(identifier) + identifier.length + 1;
    const lastIndex = output.indexOf("seconds", firstIndex) - 1;
    return output.toString().substring(firstIndex, lastIndex);
}

// Matches: "[Performance][<name>][MEAN] <scenario>: X.XXX seconds"
const METRIC_MEAN_RE = /\[Performance\]\[[^\]]+\]\[MEAN\]\s+(.+?):\s+([\d.]+)\s+seconds/g;
const METRIC_STDEV_RE = /\[Performance\]\[[^\]]+\]\[STDEV\]\s+(.+?):\s+([\d.]+)\s+seconds/g;

/**
 * Parse all metric summary lines out of a performance-script run's stdout, pairing each MEAN
 * with its matching STDEV (by scenario name).
 *
 * @param {string} output the captured stdout of the performance script
 * @returns {Array<{scenario: string, mean: number, stdev: number}>} one entry per metric
 */
function parseAllMetrics(output) {
    const stdevs = new Map();
    for (const match of output.toString().matchAll(METRIC_STDEV_RE)) {
        stdevs.set(match[1].trim(), parseFloat(match[2]));
    }
    const results = [];
    const seen = new Set();
    for (const match of output.toString().matchAll(METRIC_MEAN_RE)) {
        const scenario = match[1].trim();
        if (seen.has(scenario)) {
            continue;
        }
        seen.add(scenario);
        const mean = parseFloat(match[2]);
        const stdev = stdevs.get(scenario);
        if (!isNaN(mean) && stdev !== undefined && !isNaN(stdev)) {
            results.push({ scenario, mean, stdev });
        }
    }
    return results;
}

function printFile() {
    console.log();
    const content = readFileSync(file).toString();
    console.log(content);
    try {
        const detailContent = readFileSync(detailFile).toString();
        if (detailContent.trim().length > 0) {
            console.log();
            console.log(`Per-contribution breakdown (see ${detailFile}):`);
            console.log(detailContent);
        }
    } catch (e) {
        // Detail file may not exist if the script exited before preparing the workspace
    }
}

function log(text) {
    logToConsole(text);
    logToFile(text);
}

function logToConsole(text) {
    console.log(text);
}

function logToFile(text) {
    appendFileSync(file, text + EOL);
}

function logToDetailFile(text) {
    appendFileSync(detailFile, text + EOL);
}
