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

const licenseToolJar = path.resolve(__dirname, 'download/license.jar');
const licenseToolSummary = path.resolve(__dirname, '../license-check-summary.txt');
const licenseToolUrl = 'https://repo.eclipse.org/service/local/artifact/maven/redirect?r=dash-licenses&g=org.eclipse.dash&a=org.eclipse.dash.licenses&v=LATEST';

console.log('Fetching dash-licenses...');
if (!fs.existsSync(licenseToolJar)) {
    fs.mkdirSync(path.dirname(licenseToolJar), { recursive: true });
    spawn('curl', ['-L', licenseToolUrl, '-o', licenseToolJar]);
}
console.log('Running dash-licenses...');
spawn('java', ['-jar', licenseToolJar, 'yarn.lock', '-batch', '50', '-timeout', '240', '-summary', licenseToolSummary]);

function spawn(bin, args, opt) {
    const exit = cp.spawnSync(bin, args, { stdio: 'inherit', ...opt });
    if (exit.error) {
        console.error(exit.error);
        process.exit(1);
    }
    if (typeof exit.signal === 'string') {
        console.error(`${bin} exited with signal: ${exit.signal}`);
        process.exit(1);
    } else if (exit.status !== 0) {
        process.exit(exit.status);
    }
}
