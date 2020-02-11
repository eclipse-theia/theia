// @ts-check
'use-strict'

/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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
const fs = require('fs');

/** @type {{ [packageName: string]: YarnWorkspace }} */
const YARN_WORKSPACES = JSON.parse(cp.execSync('yarn --silent workspaces info').toString());

/**
 * Data structure storing each dependencies as:
 *
 * dependencyPackageName -> dependencyRange -> workspacePackage[]
 *
 * If our setup is correct, we should have only 1 `dependencyRange` key per `dependencyPackageName`.
 * 
 * The associated `workspacePackage` array is useful to trace which package defines which range.
 *
 * @type {{ [packageName: string]: { [packageVersion: string]: string[] } }}
 */
const PACKAGE_RANGES = Object.create(null);

// Construct the dependency range maps:
for (const [workspaceName, workspace] of Object.entries(YARN_WORKSPACES)) {
    const packageJson = readJsonFile(path.join(workspace.location, 'package.json'));
    if (!packageJson['theiaExtensions']) {
        continue; // only check theia-extension packages.
    }
    const dependencies = packageJson['dependencies'];
    if (!dependencies) {
        continue;
    }
    for (const [name, range] of Object.entries(dependencies)) {
        const ranges = PACKAGE_RANGES[name] || (PACKAGE_RANGES[name] = {});
        const workspaces = ranges[range] || (ranges[range] = []);
        workspaces.push(workspaceName);
    }
}

for (const [dependencyName, dependencyRanges] of Object.entries(PACKAGE_RANGES)) {
    const ranges = Object.entries(dependencyRanges);
    if (ranges.length > 1) {
        process.exitCode = 1;
        console.error(`${dependencyName} multiple ranges detected:`);
        for (const [range, workspaces] of ranges) {
            console.error(`  "${range}": ${JSON.stringify(workspaces)}`);
        }
    }
}

/**
 * @param {string} filePath
 * @returns {any}
 */
function readJsonFile(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath).toString());
    } catch (error) {
        console.error('ParseError in file:', filePath);
        throw error;
    }
}

/**
 * @typedef YarnWorkspace
 * @property {string} location
 * @property {string[]} workspaceDependencies
 */
