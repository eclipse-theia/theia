#!/usr/bin/env node

/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
const path = require('path');
const cp = require('child_process');

const extScriptsPck = require(path.resolve(__dirname, 'package.json'));

/**
 * Lookup the requested ext:script to run, returns the full command line to execute.
 */
function getExtScript() {
    // process.argv is always like [0:node, 1:script, 2:...args]
    const args = process.argv.slice(2);
    if (!args[0]) {
        throw new Error('Please specify the script that runs with theiaext command.');
    }
    const scripts = extScriptsPck['theia-monorepo-scripts'];
    const script = 'ext:' + args[0];
    if (!(script in scripts)) {
        throw new Error('The ext script does not exist: ' + script);
    }
    return [scripts[script], ...args.slice(1, args.length)].join(' ');
}

/**
 * Essentially wraps `child_process.exec` into a promise.
 *
 * @param script Command line to run as a shell command.
 */
function run(script) {
    return new Promise((resolve, reject) => {
        const env = Object.assign({}, process.env);
        const scriptProcess = cp.exec(script, {
            cwd: process.cwd(),
            env,
        });
        scriptProcess.stdout.pipe(process.stdout);
        scriptProcess.stderr.pipe(process.stderr);
        scriptProcess.on('error', reject);
        scriptProcess.on('close', resolve);
    });
}

(async () => {
    /** @type {Error | number} */
    let exitCode = 0;
    let extScript = undefined;
    try {
        extScript = getExtScript();
        console.debug(`$ ${extScript}`);
        exitCode = await run(extScript);
    } catch (err) {
        if (extScript) {
            console.error(`Error occurred in theiaext when executing: ${extScript}\n`);
        } else {
            console.error('Error occurred in theiaext.');
        }
        console.error(err);
        exitCode = err;
    }
    if (typeof exitCode !== 'number') {
        exitCode = 1; // Error happened without the process starting.
    } else if (exitCode) {
        console.error(`Exit with failure status (${exitCode}): ${extScript}`);
    }
    process.exit(exitCode);
})();
