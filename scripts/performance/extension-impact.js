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
const { execSync, exec, spawn } = require('child_process');
const net = require('net');
const { EOL } = require('os');
const { copyFileSync, readdirSync, writeFileSync, appendFileSync, unlinkSync, readFileSync, rmSync } = require('fs');
const { ensureFileSync } = require('fs-extra');
const mkdirp = require('mkdirp');
const path = require('path');
/** The port on which the browser example's backend listens by default. */
const BROWSER_PORT = 3000;

const env = Object.assign({}, process.env);
env.PATH = path.resolve("../../node_modules/.bin") + path.delimiter + env.PATH;
let basePackage;
const { exit } = require('process');
const { workbenchVisible, delay } = require('./common-performance');
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
/** The browser example's backend while a measurement is running, so that an exit for any reason can stop it. */
let backendProcess;

function sigintHandler() {
    if (cancelled) {
        // Second Ctrl+C: the first one is still unwinding, force-quit now.
        process.exit(130);
    }
    cancelled = true;
    console.error('\nInterrupted — aborting at the next safe point. Press Ctrl+C again to force-quit.');
    // Stop a running backend properly (escalation, port released) before exiting; the exit handler only
    // gets to send a single signal.
    const stopped = backendProcess ? stopBackend(backendProcess, BROWSER_PORT) : Promise.resolve();
    stopped.finally(() => process.exit(130));
}

/** Whether the run was aborted by a failure; the result tables are not printed then. */
let failed = false;

async function exitHandler() {
    // Synchronous: the process is exiting, and a detached backend would otherwise keep running and hold its port.
    killBackend(backendProcess, 'SIGTERM');
    cleanWorkspace();
    if (!failed) {
        printFile();
    }
}

/**
 * Abort the run: a measurement that could not be taken leaves nothing to compare, so carrying on would only
 * print tables without results.
 *
 * @param {string} message what went wrong
 */
function fail(message) {
    failed = true;
    console.error(message);
    exit(1);
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
    // THEIA_CONFIG_DIR is passed through FileUri.create() in env-variables-server.ts,
    // which produces `/./...` for relative paths and then fails with EROFS trying to
    // mkdir at the filesystem root. Always pass an absolute path.
    const configDir = path.resolve(__dirname, 'theia-config-dir');
    const content = readFileSync(path.resolve(__dirname, './base-package.json'), 'utf-8')
        .replace(/\{\{app\}\}/g, hostApp)
        .replace(/\{\{version\}\}/g, version)
        .replace(/\{\{configDir\}\}/g, configDir);
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
    rmSync('../../noPlugins', { recursive: true, force: true });
    rmSync('./theia-config-dir', { recursive: true, force: true });
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
        fail(`Could not build the ${hostApp} example with ${extensionQualifier}, see the build output above.`);
    }

    logToConsole(`Measuring the startup time with ${extensionQualifier} ${runs} times. This may take a while.`);
    let output;
    if (hostApp === 'browser') {
        output = await measureBrowser();
    } else if (hostApp === 'electron') {
        const command = `node electron-performance.js  --name Electron --folder electron --runs ${runs}${workspace ? ' --workspace "' + workspace + '"' : ''}`;
        output = await execCommand(command, { env: env, cwd: __dirname, shell: true });
    } else {
        console.log('Unknown host app:', hostApp);
        exit(1);
    }
    if (cancelled) {
        return;
    }

    const mean = getMeasurement(output, `[MEAN] ${workbenchVisible}:`);
    const stdev = getMeasurement(output, `[STDEV] ${workbenchVisible}:`);

    if (isNaN(mean) || isNaN(stdev)) {
        fail(`Could not measure the start-up with ${extensionQualifier}: the report of the measurement script has no '${workbenchVisible}' metric, see its output above.`);
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

    // Emit per-metric breakdowns (everything except the headline metric that's already in the main CSV).
    for (const metric of parseAllMetrics(output)) {
        if (metric.scenario === workbenchVisible) {
            continue;
        }
        const metricCv = metric.mean > 0 ? ((metric.stdev / metric.mean) * 100).toFixed(3) : '-';
        logToDetailFile(`${extensionQualifier}, ${metric.scenario}, ${metric.mean.toFixed(3)}, ${metric.stdev.toFixed(3)}, ${metricCv}`);
    }
}

/**
 * Whether nothing listens on the given `port` of the loopback address, on which the browser example's backend listens.
 *
 * @param {number} port the port to check
 * @returns {Promise<boolean>} whether the port is free
 */
function isPortFree(port) {
    return new Promise(resolve => {
        const server = net.createServer();
        server.once('error', () => resolve(false));
        server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
}

/**
 * Exit with a message if something already listens on the given `port`, which the browser example's backend needs.
 *
 * @param {number} port the port to check
 */
async function assertPortFree(port) {
    if (!await isPortFree(port)) {
        fail(`Port ${port} is in use, probably by a running Theia backend. Stop it before measuring: the browser example cannot start otherwise.`);
    }
}

/**
 * Measure the start-up of the browser example as it is currently built: start its backend, run the
 * measurement script against it, and stop the backend again, whatever the outcome of the measurement.
 *
 * @returns {Promise<string>} the output of the measurement script
 */
async function measureBrowser() {
    await assertPortFree(BROWSER_PORT);
    const backend = startBrowserBackend();
    let output;
    let failure;
    try {
        await waitForBackend(backend, BROWSER_PORT, 60_000);
        const command = `node browser-performance.js --name Browser --folder browser --runs ${runs}${url ? ' --url ' + url : ''}`;
        output = await execCommand(command, { env: env, cwd: __dirname, shell: true });
    } catch (error) {
        failure = error;
    } finally {
        // Also when the backend did not come up: `fail()` exits the process, so it must not run before this.
        await stopBackend(backend, BROWSER_PORT);
    }
    if (failure) {
        fail(failure.message);
    }
    return output;
}

/**
 * Start the browser example's backend so that the whole tree it spawns (npm, the shell, node) can be stopped later:
 * in a process group of its own on POSIX, through a shell on Windows, where `taskkill` ends the tree by its root.
 * The base application's package.json (`base-package.json`) defines its own `start` script at debug log level.
 * Its output is kept out of the report, except for its errors, which explain a measurement that could not run.
 *
 * @returns {import('child_process').ChildProcess} the backend process
 */
function startBrowserBackend() {
    const windows = process.platform === 'win32';
    const backend = spawn('npm', ['--prefix', 'examples/browser', 'run', '-s', 'start'], {
        cwd: path.resolve(__dirname, '../../'),
        env: env,
        detached: !windows,
        shell: windows,
        stdio: ['ignore', 'pipe', 'pipe']
    });
    backendProcess = backend;
    const relayErrors = chunk => chunk.toString().split('\n')
        .filter(line => /error|exception|cannot|failed/i.test(line))
        .forEach(line => console.error(line));
    backend.stdout.on('data', relayErrors);
    backend.stderr.on('data', relayErrors);
    return backend;
}

/**
 * Wait until the backend accepts connections on its `port`. Rejects if it exits or does not get there in time,
 * so that the caller can stop what is left of it before failing the run.
 *
 * @param {import('child_process').ChildProcess} backend the backend process
 * @param {number} port the port the backend listens on
 * @param {number} timeoutMs how long to wait at most
 */
async function waitForBackend(backend, port, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        if (backend.exitCode !== null || backend.signalCode !== null) {
            throw new Error(`The ${hostApp} example's backend exited with ${backend.exitCode ?? backend.signalCode} before it was listening, see its errors above.`);
        }
        if (await canConnect(port)) {
            return;
        }
        await delay(250);
    }
    throw new Error(`The ${hostApp} example's backend did not listen on port ${port} within ${timeoutMs / 1000} seconds.`);
}

/**
 * @param {number} port the port to connect to on the loopback address
 * @returns {Promise<boolean>} whether a connection could be established
 */
function canConnect(port) {
    return new Promise(resolve => {
        const socket = net.connect({ port, host: '127.0.0.1' });
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('error', () => resolve(false));
    });
}

/**
 * Stop the backend and everything it spawned, and wait until its port is free again for the next measurement.
 *
 * @param {import('child_process').ChildProcess} backend the backend process
 * @param {number} port the port the backend listened on
 */
async function stopBackend(backend, port) {
    if (isBackendAlive(backend)) {
        killBackend(backend, 'SIGTERM');
        const deadline = Date.now() + 5000;
        while (isBackendAlive(backend) && Date.now() < deadline) {
            await delay(100);
        }
        if (isBackendAlive(backend)) {
            killBackend(backend, 'SIGKILL');
        }
    }
    const deadline = Date.now() + 10000;
    while (!await isPortFree(port) && Date.now() < deadline) {
        await delay(250);
    }
    if (backendProcess === backend) {
        backendProcess = undefined;
    }
}

/**
 * Whether anything of the backend is still running: on POSIX any member of its process group (the npm wrapper
 * may be gone while the node process it spawned is still shutting down), on Windows the root of the tree.
 *
 * @param {import('child_process').ChildProcess} backend the backend process
 * @returns {boolean} whether the backend, or a process it spawned, is alive
 */
function isBackendAlive(backend) {
    if (process.platform === 'win32') {
        return backend.exitCode === null && backend.signalCode === null;
    }
    try {
        process.kill(-backend.pid, 0);
        return true;
    } catch {
        return false;
    }
}

/**
 * Send a `signal` to the backend and to everything it spawned: its process group on POSIX; on Windows, where
 * signals do not exist and the backend runs under a shell, `taskkill` ends the whole tree below the shell
 * forcibly, whatever the signal. Synchronous, so that the exit handler can use it as well.
 *
 * @param {import('child_process').ChildProcess | undefined} backend the backend process, if any
 * @param {NodeJS.Signals} signal the signal to send
 */
function killBackend(backend, signal) {
    if (!backend) {
        return;
    }
    try {
        if (process.platform === 'win32') {
            execSync(`taskkill /pid ${backend.pid} /T /F`, { stdio: 'ignore' });
        } else {
            process.kill(-backend.pid, signal);
        }
    } catch {
        // already gone
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

/**
 * The last value reported for an `identifier` such as `[MEAN] Workbench visible:` in the `output` of a
 * measurement script, in seconds, or `NaN` if the output does not report it.
 *
 * @param {string} output the output of the measurement script
 * @param {string} identifier the label of the value, including the trailing colon
 * @returns {number} the value in seconds, or `NaN`
 */
function getMeasurement(output, identifier) {
    const index = output.lastIndexOf(identifier);
    if (index < 0) {
        return NaN;
    }
    const match = /^\s*([\d.]+) seconds/.exec(output.substring(index + identifier.length));
    return match ? parseFloat(match[1]) : NaN;
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
