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
const fsx = require('fs-extra');
const { resolve } = require('path');
const { spawn, ChildProcess } = require('child_process');
const { delay, githubReporting, isLCP, lcp, measure } = require('./common-performance');
const traceConfigTemplate = require('./electron-trace-config.json');
const { exit } = require('process');

const basePath = resolve(__dirname, '../..');
const profilesPath = resolve(__dirname, './profiles/');
const electronExample = resolve(basePath, 'examples/electron');
const theia = resolve(electronExample, 'node_modules/.bin/theia');

let name = 'Electron Frontend Startup';
let folder = 'electron';
let runs = 10;
let workspace = resolve('./workspace');
let debugging = false;

(async () => {
    let defaultWorkspace = true;

    const yargs = require('yargs');
    const args = yargs(process.argv.slice(2)).option('name', {
        alias: 'n',
        desc: 'A name for the test suite',
        type: 'string',
        default: name
    }).option('folder', {
        alias: 'f',
        desc: 'Name of a folder within the "profiles" folder in which to collect trace logs',
        type: 'string',
        default: folder
    }).option('runs', {
        alias: 'r',
        desc: 'The number of times to run the test',
        type: 'number',
        default: runs
    }).option('workspace', {
        alias: 'w',
        desc: 'Path to a Theia workspace to open',
        type: 'string',
        default: workspace
    }).option('debug', {
        alias: 'X',
        desc: 'Whether to log debug information',
        boolean: true
    }).wrap(Math.min(120, yargs.terminalWidth())).argv;

    if (args.name) {
        name = args.name.toString();
    }
    if (args.folder) {
        folder = args.folder.toString();
    }
    if (args.workspace) {
        workspace = args.workspace.toString();
        if (resolve(workspace) !== workspace) {
            console.log('Workspace path must be an absolute path:', workspace);
            exit(1);
        }
        defaultWorkspace = false;
    }
    if (args.runs) {
        runs = parseInt(args.runs.toString());
    }
    debugging = args.debug;
    if (process.env.GITHUB_ACTIONS) {
        githubReporting.enabled = true;
    }

    // Verify that the application exists
    const indexHTML = resolve(electronExample, 'src-gen/frontend/index.html');
    if (!fsx.existsSync(indexHTML)) {
        console.error('Electron example app does not exist. Please build it before running this script.');
        process.exit(1);
    }

    if (defaultWorkspace) {
        // Ensure that it exists
        fsx.ensureDirSync(workspace);
    }

    await measurePerformance();
})();

async function measurePerformance() {
    fsx.emptyDirSync(resolve(profilesPath, folder));
    const traceConfigPath = resolve(profilesPath, folder, 'trace-config.json');

    /**
     * Generate trace config from the template.
     * @param {number} runNr
     * @returns {string} the output trace file path
     */
    const traceConfigGenerator = (runNr) => {
        const traceConfig = { ...traceConfigTemplate };
        const traceFilePath = resolve(profilesPath, folder, `${runNr}.json`);
        traceConfig.result_file = traceFilePath
        fsx.writeFileSync(traceConfigPath, JSON.stringify(traceConfig, undefined, 2), 'utf-8');
        return traceFilePath;
    };

    const exitHandler = (andExit = false) => {
        return () => {
            if (electron && !electron.killed) {
                process.kill(-electron.pid, 'SIGINT');
            }
            if (andExit) {
                process.exit();
            }
        }
    };

    // Be sure not to leave a detached Electron child process
    process.on('exit', exitHandler());
    process.on('SIGINT', exitHandler(true));
    process.on('SIGTERM', exitHandler(true));

    let electron;

    /** @type import('./common-performance').TestFunction */
    const testScenario = async (runNr) => {
        const traceFile = traceConfigGenerator(runNr);
        electron = await launchElectron(traceConfigPath);

        electron.stderr.on('data', data => analyzeStderr(data.toString()));

        // Wait long enough to be sure that tracing has finished. Kill the process group
        // because the 'theia' child process was detached
        await delay(traceConfigTemplate.startup_duration * 1_000 * 3 / 2)
            .then(() => electron.exitCode !== null || process.kill(-electron.pid, 'SIGINT'));
        electron = undefined;
        return traceFile;
    };

    measure(name, lcp, runs, testScenario, hasNonzeroTimestamp, isLCP);
}

/**
 * Launch the Electron app as a detached child process with tracing configured to start
 * immediately upon launch. The child process is detached because otherwise the attempt
 * to signal it to terminate when the test run is complete will not terminate the entire
 * process tree but only the root `theia` process, leaving the electron app instance
 * running until eventually this script itself exits.
 * 
 * @param {string} traceConfigPath the path to the tracing configuration file with which to initiate tracing
 * @returns {Promise<ChildProcess>} the Electron child process, if successfully launched
 */
async function launchElectron(traceConfigPath) {
    const args = ['start', workspace, '--plugins=local-dir:../../plugins', `--trace-config-file=${traceConfigPath}`];
    if (process.platform === 'linux') {
        args.push('--headless');
    }
    return spawn(theia, args, { cwd: electronExample, detached: true });
}

function hasNonzeroTimestamp(traceEvent) {
    return traceEvent.hasOwnProperty('ts') // The traces don't have explicit nulls or undefineds
        && traceEvent.ts > 0;
}

/**
 * Analyze a `chunk` of text on the standard error stream of the child process.
 * If running in debug mode, this will always at least print out the `chunk` to the console.
 * In addition, the text is analyzed to look for known conditions that will invalidate the
 * test procedure and cause the script to bail. These include:
 * 
 * - the native browser modules not being built correctly for Electron
 * 
 * @param {string} chunk a chunk of standard error text from the child process
 */
function analyzeStderr(chunk) {
    if (debugging) {
        console.error('>', chunk.trimEnd());
    }

    if (chunk.includes('Error: Module did not self-register')) {
        console.error('Native browser modules are not built properly. Please rebuild the workspace and try again.');
        exit(1);
    }
}
