/********************************************************************************
 * Copyright (c) 2019 TypeFox and others
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
const chalk = require('chalk').default;
const cp = require('child_process');

let code = 0;
const workspaces = JSON.parse(cp.execSync('yarn --silent workspaces info').toString());
for (const name in workspaces) {
    const workspace = workspaces[name];
    const location = path.resolve(process.cwd(), workspace.location);
    const packagePath = path.resolve(location, 'package.json');
    const pck = require(packagePath);
    if (!pck.private) {
        const pckName = `${pck.name}@${pck.version}`;
        if (cp.execSync(`npm view ${pckName} version --json`).toString().trim()) {
            console.info(`${pckName}: published`);
        } else {
            console.error(`(${chalk.red('ERR')}) ${pckName}: ${chalk.red('NOT')} published`);
            code = 1;
        }
    }
}
process.exit(code);
