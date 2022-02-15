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

const LICENSE_HEADER = `\
/********************************************************************************
* Copyright (C) 2022 Ericsson(autogen) and others.
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
********************************************************************************/`;

const NESTED_INDEX_TS_TEMPLATE = `\
${LICENSE_HEADER}

export { };

`;

const ROOT_INDEX_TS_TEMPLATE = `\
${LICENSE_HEADER}

{{#exportStar}}
{{#modules}}
export * from '{{&modulePath}}';
{{/modules}}
{{/exportStar}}
{{#lazy}}
{{#modules}}
export declare const {{&variableName}}: typeof import('{{&modulePath}}');
{{/modules}}
function _lazyProperty(get: () => unknown): PropertyDescriptor {
    return {
        configurable: true,
        enumerable: true,
        writable: true,
        get
    };
}
Object.defineProperties(exports, {
    {{#modules}}
    {{&variableName}}: _lazyProperty(() => require('{{&modulePath}}')),
    {{/modules}}
});
{{/lazy}}
`;

process.on('unhandledRejection', error => {
    throw error;
});
process.on('uncaughtException', error => {
    console.error(error);
    process.exitCode = 1;
});
generateEntryPoints();

async function generateEntryPoints() {
    await Promise.all(Object.entries(YARN_WORKSPACES).map(async ([name, workspace]) => {
        const packageRoot = path.resolve(ROOT, workspace.location);
        const packageJsonPath = path.resolve(packageRoot, 'package.json');
        const packageJson = await fs.readJson(packageJsonPath);
        if (packageJson.theiaPackageEntryPoints) {
            await Promise.all(Object.entries(packageJson.theiaPackageEntryPoints).map(async ([file, description]) => {
                const entryPointPath = ensureExt(path.resolve(packageRoot, file), '.ts');
                if ((await fs.stat(entryPointPath)).isDirectory()) {
                    throw new Error(`Expected a file got a directory: ${entryPointPath}`);
                }
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
                    const entryPointDir = path.dirname(entryPointPath);
                    const entries = Object.entries(lazy);
                    let entry; while (entry = entries.shift()) {
                        const [variableName, modulePath] = entry;
                        if (variableName === '+theia-runtimes') {
                            for (const dir of await fs.readdir(entryPointDir)) {
                                const name = THEIA_RUNTIME_FOLDERS.get(dir);
                                if (name && !lazy[name]) {
                                    entries.push([name, `./${dir}`]);
                                }
                            }
                            continue;
                        }
                        let nestedIndexPath = path.resolve(entryPointDir, modulePath);
                        if ((await fs.stat(nestedIndexPath)).isDirectory()) {
                            nestedIndexPath = path.resolve(nestedIndexPath, 'index.ts');
                        } else {
                            nestedIndexPath = ensureExt(nestedIndexPath, '.ts');
                        }
                        if (!await fs.pathExists(nestedIndexPath)) {
                            await write(nestedIndexPath, NESTED_INDEX_TS_TEMPLATE);
                        }
                        view.lazy.modules.push({ variableName, modulePath });
                    }
                }
                const rendered = mustache.render(ROOT_INDEX_TS_TEMPLATE, view);
                await write(entryPointPath, rendered);
            }))
        }
    }));
}

function ensureExt(filePath, ext) {
    const { dir, name } = path.parse(filePath);
    return path.resolve(dir, `${name}${ext}`);
}

async function write(filePath, content) {
    if (process.env.THEIA_GENERATE_ENTRY_POINTS_DRY) {
        console.log(filePath);
        console.log(content);
        process.exitCode = 1;
        return;
    }
    await fs.writeFile(filePath, content);
}
