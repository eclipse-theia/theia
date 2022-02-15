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

const THEIA_RUNTIME_FOLDERS = {
    exportStar: new Set([
        'common',
        'electron-common'
    ]),
    lazy: new Map([
        ['browser', 'browser'],
        ['electron-browser', 'electronBrowser'],
        ['electron-main', 'electronMain'],
        ['electron-node', 'electronNode'],
        ['node', 'node']
    ])
};

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
                const entryPointDir = path.dirname(entryPointPath);
                const exportStar = description['export *'] || [];
                const lazy = description['lazy'] || [];
                const _extends = description['extends'];
                if (_extends && _extends.includes('+theia-runtimes')) {
                    for (const dir of await fs.readdir(entryPointDir)) {
                        if (THEIA_RUNTIME_FOLDERS.exportStar.has(dir) && !exportStar.includes(dir)) {
                            exportStar.push(`./${dir}`);
                        }
                        if (lazy) {
                            const variableName = THEIA_RUNTIME_FOLDERS.lazy.get(dir);
                            if (variableName && !lazy[variableName]) {
                                lazy[variableName] = `./${dir}`;
                            }
                        }
                    }
                }
                const view = {};
                if (exportStar.length > 0) {
                    view.exportStar = {
                        modules: []
                    };
                    for (const modulePath of exportStar) {
                        await ensureIndex(path.resolve(entryPointDir, modulePath));
                        view.exportStar.modules.push({ modulePath });
                    }
                }
                if (Object.keys(lazy).length > 0) {
                    view.lazy = {
                        modules: []
                    };
                    for (const [variableName, modulePath] of Object.entries(lazy)) {
                        await ensureIndex(path.resolve(entryPointDir, modulePath));
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

async function ensureIndex(modulePath) {
    if ((await fs.stat(modulePath)).isDirectory()) {
        modulePath = path.resolve(modulePath, 'index.ts');
    } else {
        modulePath = ensureExt(modulePath, '.ts');
    }
    if (!await fs.pathExists(modulePath)) {
        await write(modulePath, NESTED_INDEX_TS_TEMPLATE);
    }
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
