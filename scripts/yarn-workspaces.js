/********************************************************************************
 * Copyright (C) 2022 Ericsson and others.
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

const cp = require('child_process');
const path = require('path');

module.exports = {
    getYarnWorkspaces
};

/**
 * @typedef YarnWorkspace
 * @property {string} name
 * @property {string} location
 * @property {string[]} [workspaceDependencies]
 */

function getYarnWorkspaces(cwd = process.cwd()) {
    /** @type {{ [packageName: string]: YarnWorkspace }} */
    const worskpaces = JSON.parse(cp.execSync('yarn --silent workspaces info', { cwd }).toString());
    // Add the package name inside each package object.
    for (const [packageName, yarnWorkspace] of Object.entries(worskpaces)) {
        yarnWorkspace.name = packageName;
        // For some reason Yarn doesn't report local peer dependencies, so we'll manually do it:
        const { peerDependencies } = require(path.resolve(cwd, yarnWorkspace.location, 'package.json'));
        if (typeof peerDependencies === 'object') {
            for (const peerDependency of Object.keys(peerDependencies)) {
                if (peerDependency in worskpaces) {
                    yarnWorkspace.workspaceDependencies.push(peerDependency);
                }
            }
        }
    }
    return worskpaces;
}
