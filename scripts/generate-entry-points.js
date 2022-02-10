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

const path = require('path');
const fs = require('fs-extra');
const mustache = require('mustache');
const { getYarnWorkspaces } = require('./yarn-workspaces');

const ROOT = path.join(__dirname, '..');

const YARN_WORKSPACES = getYarnWorkspaces(ROOT);

const THEIA_RUNTIME_FOLDERS = new Map([
    ['browser', 'browser'],
    ['electron-browser', 'electronBrowser'],
    ['electron-main', 'electronMain'],
    ['electron-node', 'electronNode'],
    ['node', 'node']
]);

const template = `/********************************************************************************
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

{{#exportStar}}
{{#modules}}
export * from '{{&modulePath}}';
{{/modules}}
{{/exportStar}}
{{#lazy}}
{{#modules}}
export declare const {{&variableName}}: typeof import('{{&modulePath}}');
{{/modules}}
const _cache: Record<string, unknown> = {};
function _lazyRequire(path) {
    return {
        configurable: true,
        enumerable: true,
        writable: true,
        get: () => _cache[path] ??= require(path)
    };
}
Object.defineProperties(exports, {
    {{#modules}}
    {{&variableName}}: _lazyRequire('{{&modulePath}}'),
    {{/modules}}
});
{{/lazy}}
`;

process.on('unhandledRejection', error => {
    throw error;
});
process.on('uncaughtException', error => {
    console.error(error);
    process.exit(1);
});
generateEntryPoints();

async function generateEntryPoints() {
    await Promise.all(Object.entries(YARN_WORKSPACES).map(async ([name, workspace]) => {
        const packageRoot = path.resolve(ROOT, workspace.location);
        const packageJsonPath = path.resolve(packageRoot, 'package.json');
        const packageJson = await fs.readJson(packageJsonPath);
        if (packageJson.theiaPackageEntryPoints) {
            await Promise.all(Object.entries(packageJson.theiaPackageEntryPoints).map(async ([file, description]) => {
                const entryPointPath = path.resolve(packageRoot, file);
                const exportStar = description['export *'];
                const lazy = description['lazy'];
                const view = {};
                if (exportStar) {
                    view.exportStar = {
                        modules: []
                    };
                    for (const modulePath of exportStar) {
                        view.exportStar.modules.push({ modulePath });
                    }
                }
                if (lazy) {
                    view.lazy = {
                        modules: []
                    };
                    for (let [variableName, modulePath] of Object.entries(lazy)) {
                        if (variableName === '+theia-runtimes') {
                            for (const dir of await fs.readdir(path.dirname(entryPointPath))) {
                                variableName = THEIA_RUNTIME_FOLDERS.get(dir);
                                if (variableName && !lazy[variableName]) {
                                    view.lazy.modules.push({ variableName, modulePath: `./${dir}` });
                                }
                            }
                        } else {
                            view.lazy.modules.push({ variableName, modulePath });
                        }
                    }
                }
                const rendered = mustache.render(template, view);
                console.log(entryPointPath);
                console.log(rendered);
            }))
        }
    }));
}
