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
const fs = require('fs');
const cp = require('child_process');
const { packagePath } = require('yargs').option('packagePath', {
    alias: 'p',
    description: 'A location where to bundle the app, should not belong to Theia repo.',
    demandOption: true
}).argv;

let content = '';
const workspaces = JSON.parse(JSON.parse(cp.execSync('yarn workspaces info --json', { cwd: path.resolve(__dirname, '..') }).toString()).data);
for (const name in workspaces) {
    const workspace = workspaces[name];
    const location = path.resolve(process.cwd(), workspace.location);
    const packagePath = path.resolve(location, 'package.json');
    const pck = require(packagePath);
    if (!pck.private) {
        const pckQN = `${pck.name}@${pck.version}`;
        console.log(pckQN + ': resolving');

        const filename = `${name.split('/', 2)[1]}.tgz`;
        cp.execSync(`yarn pack --filename ${filename}`, { cwd: location }).toString();

        const fullpath = path.join(location, filename);
        console.log(pckQN + `: resolved to "${fullpath}"`);

        const output = cp.execSync(`yarn generate-lock-entry --resolved file://${fullpath}`, { cwd: location }).toString();
        const body = output.substr(output.indexOf(':') + 1);
        content += `"${pckQN}", "${pck.name}@^${pck.version}":${body}`;
    }
}
fs.writeFileSync(path.join(packagePath, 'yarn.lock'), content, { encoding: 'utf-8' });

const examplePck = require(path.resolve(__dirname, '../examples/electron/package.json'));
examplePck.scripts = {
    'prepare': 'yarn build && yarn bundle',
    'build': 'theia build --mode development',
    'bundle': 'electron-builder'
};
examplePck.dependencies = {
    ...examplePck.dependencies,
    'typescript': 'latest',
    'tslint': 'latest'
}
examplePck.devDependencies = {
    ...examplePck.devDependencies,
    'electron-builder': '^20.36.2'
};
examplePck.build = {
    productName: 'Theia',
    appId: 'theia',
    asar: false,
    linux: {
        target: [
            'AppImage'
        ],
        category: 'Development'
    },
    artifactName: "${name}-${version}-${os}.${ext}"
}
fs.writeFileSync(path.join(packagePath, 'package.json'), JSON.stringify(examplePck, undefined, 2), { encoding: 'utf-8' });

cp.spawn('yarn', [], {
    cwd: packagePath,
    stdio: [0, 1, 2],
    env: process.env
});
