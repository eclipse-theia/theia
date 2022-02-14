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
// @ts-check
const fs = require('fs').promises;
const path = require('path');

const pathToMonaco = path.resolve(process.argv[2]);
const allCSSFiles = new Set();

/**
 * @param {string} dirpath 
 */
async function checkDirForCSS(dirpath) {
    const contents = await fs.readdir(dirpath);
    const childPromises = contents.map(childPath => {
        const fullPath = path.resolve(dirpath, childPath);
        return fs.stat(fullPath).then(stat => {
            if (stat.isDirectory()) {
                return checkDirForCSS(fullPath);
            } else if (path.extname(childPath) === '.css') {
                allCSSFiles.add(fullPath);
            }
        });
    });
    await Promise.all(childPromises);
}

checkDirForCSS(pathToMonaco).then(() => {
    const content = `
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

${Array.from(allCSSFiles, filepath => `import '${filepath.slice(filepath.indexOf('monaco-editor-core'))}';`).join('\n')}
`
    return fs.writeFile(path.resolve(__dirname, '../src/browser/style/monaco-style-imports.ts'), content);
})
