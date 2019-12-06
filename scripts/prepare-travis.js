#!/usr/bin/env node

/********************************************************************************
 * Copyright (c) 2018-2020 TypeFox and others
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

/**
 * Sync cached directories in the travis file. It is executed by the prepare npm script, i.e. each time whenever dependencies are installed.
 */

const fs = require('fs');
const path = require('path');
const child_process = require('child_process');
const os = require('os');

const directories = ['node_modules'];

const workspaces = JSON.parse(JSON.parse(child_process.execSync('yarn workspaces --json info').toString()).data);
for (const name in workspaces) {
    const workspace = workspaces[name];
    const nodeModulesPath = [workspace.location, 'node_modules'].join('/');
    if (fs.existsSync(path.join(process.cwd(), nodeModulesPath))) {
        directories.push(nodeModulesPath);
    }
}

const yarnList = child_process.execSync('yarn list -s --pattern vscode-ripgrep').toString();
const regexp = new RegExp('vscode-ripgrep@(.*)', 'g');
while (match = regexp.exec(yarnList)) {
    const ripgrepPath = '/tmp/vscode-ripgrep-cache-' + match[1].trim();
    directories.push(ripgrepPath);
}

const travisPath = path.resolve(__dirname, '../.travis.yml');
const content = fs.readFileSync(travisPath).toString();
// compute checked out travis line ending characters
const endOfLine = content[content.indexOf('\n') - 1] === '\r' ? '\r\n' : '\n';
const startIndex = content.indexOf('# start_cache_directories') + '# start_cache_directories'.length;
const endIndex = content.indexOf('# end_cache_directories');
const result = content.substr(0, startIndex) + endOfLine +
    directories.sort((d, d2) => d.localeCompare(d2)).map(d => `    - ${d}${endOfLine}`).join('') +
    '    ' + content.substr(endIndex);
fs.writeFileSync(travisPath, result);
