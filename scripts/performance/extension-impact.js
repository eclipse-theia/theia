/********************************************************************************
 * Copyright (C) 2021 STMicroelectronics and others.
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
const { execSync, exec } = require('child_process');
const { EOL } = require('os');
const { copyFileSync, readdirSync, writeFileSync, appendFileSync, unlinkSync, readFileSync, rmdirSync } = require('fs');
const { ensureFileSync } = require('fs-extra');
const mkdirp = require('mkdirp');
const path = require('path');
const env = Object.assign({}, process.env);
env.PATH = path.resolve("../../node_modules/.bin") + path.delimiter + env.PATH;
const basePackage = require(`./base-package.json`);
let runs = 10;
let baseTime;
let extensions = [];
let yarn = false;
let url;
let file = path.resolve('./script.csv');

async function sigintHandler() {
    process.exit();
}

async function exitHandler() {
    cleanWorkspace();
    printFile();
}

(async () => {
    process.on('SIGINT', sigintHandler);
    process.on('exit', exitHandler);
    const args = require('yargs/yargs')(process.argv.slice(2))
        .option('base-time', {
            alias: 'b',
            desc: 'Pass an existing mean of the base application',
            type: 'number'
        })
        .option('runs', {
            alias: 'r',
            desc: 'The number of runs to measure',
            type: 'number'
        })
        .option('extensions', {
            alias: 'e',
            desc: `An array of extensions to test (defaults to the extensions in the packages folder).
                - Each entry must have this format: {name}:{version}
                - Entries are separated by whitespaces
                - Example: --extensions @theia/git:1.18.0 @theia/keymaps:1.18.0`,
            type: 'array'
        })
        .option('yarn', {
            alias: 'y',
            desc: 'Build all typescript sources on script start',
            type: 'boolean'
        }).option('url', {
            alias: 'u',
            desc: 'Specify a custom URL at which to launch Theia (e.g. with a specific workspace)',
            type: 'string'
        }).option('file', {
            alias: 'f',
            desc: 'Specify the relative path to a CSV file which stores the result (default: ./extensions.csv)',
            type: 'string'
        }).argv;
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
    if (args.file) {
        file = path.resolve(args.file);
        if (!file.endsWith('.csv')) {
            console.error('--file must end with .csv');
            return;
        }
    }
    prepareWorkspace();
    if (yarn) {
        execSync('yarn build', { cwd: '../../', stdio: 'pipe' });
    }
    await extensionImpact(extensions);
})();

async function extensionImpact(extensions) {
    logToFile(`Extension Name, Mean (${runs} runs) (in s), Std Dev (in s), CV (%), Delta (in s)`);
    if (baseTime === undefined) {
        calculateExtension(undefined);
    } else {
        log(`Base Theia (provided), ${baseTime}, -, -, -`);
    }

    if (extensions.length < 1) {
        extensions = await getExtensionsFromPackagesDir();
    }

    for (const e of extensions) {
        await calculateExtension(e);
    }
}

function prepareWorkspace() {
    copyFileSync('../../examples/browser/package.json', './backup-package.json');
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
}

function cleanWorkspace() {
    copyFileSync('./backup-package.json', '../../examples/browser/package.json');
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
    logToConsole(`Building the browser example with ${extensionQualifier}.`);
    writeFileSync(`../../examples/browser/package.json`, JSON.stringify(basePackageCopy, null, 2));
    try {
        execSync('yarn browser build', { cwd: '../../', stdio: 'pipe' });
    } catch (error) {
        log(`${extensionQualifier}, Error while building the package.json, -, -, -`);
        return;
    }

    logToConsole(`Measuring the startup time with ${extensionQualifier} ${runs} times. This may take a while.`);
    const output = await execCommand(
        `concurrently --success first -k -r "cd scripts/performance && node measure-performance.js --name Startup --folder script --runs ${runs}${url ? ' --url ' + url : ''}" `
        + `"yarn --cwd examples/browser start | grep -v '.*'"`, { env: env, cwd: '../../', shell: true });

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

function printFile() {
    console.log();
    const content = readFileSync(file).toString();
    console.log(content);
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
