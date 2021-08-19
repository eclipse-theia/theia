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

const path = require('path');
const cp = require('child_process');
const fs = require('fs');
const licenseTool = 'license.jar';
const url = "https://repo.eclipse.org/service/local/artifact/maven/redirect?r=dash-licenses&g=org.eclipse.dash&a=org.eclipse.dash.licenses&v=LATEST";

console.log("Fetching dash-licenses...");
if (!fs.existsSync(path.resolve(process.cwd(), licenseTool))) {
    try {
        cp.execSync(`curl -L \"${url}\" -o ${licenseTool}`);
    }
    catch (error) {
        process.exit(1);
    }
}

console.log("Running dash-licenses...");
const out=cp.spawnSync('java', ['-jar', licenseTool, 'yarn.lock', '-batch', '50', '-timeout', '240', '-summary', 'license-check-summary.txt']);
if (out.status > 0) {
    console.log(out.stdout.toString());
    process.exit(out.status);
}
