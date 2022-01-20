/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

const fs = require('fs');
const os = require('os');
const path = require('path');
const { PackageReExport } = require('@theia/re-export');

const shared = path.resolve(__dirname, '../shared');
const electronPackageReExport = new PackageReExport(require('../package.json'), '@theia/electron/shared/');

generateShared().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

async function generateShared() {
    await mkdirp(shared);
    await Promise.all([
        ...electronPackageReExport.generateReExports().map(
            item => writeReExport(item.export, item.generated, shared),
        ),
    ]);
}


/**
 * @param {import('@theia/re-export').ExportStar | import('@theia/re-export').ExportEqual} exp the re-export data
 * @param {import('@theia/re-export').GeneratedReExport} generated the content of the generated files
 * @param {string} out directory where to write the generated files
 */
async function writeReExport(exp, generated, out) {
    const base = await prepareOutputDir(out, exp.alias || exp.module);
    await Promise.all([
        writeFileIfMissing(`${base}.js`, generated.js),
        writeFileIfMissing(`${base}.d.ts`, generated.dts),
    ]);
}

/**
 * @param {string} moduleName
 * @returns {Promise<string>} target filename without extension (base)
 */
async function prepareOutputDir(out, moduleName) {
    const base = path.resolve(out, moduleName);
    // Handle case like '@a/b/c/d.js' => mkdirp('@a/b/c')
    await mkdirp(path.dirname(base));
    return base;
}

async function mkdirp(directory) {
    await fs.promises.mkdir(directory, { recursive: true });
}

async function writeFileIfMissing(file, content) {
    if (await fs.promises.access(file).then(ok => false, error => true)) {
        await writeFile(file, content);
    }
}

async function writeFile(file, content) {
    if (process.platform === 'win32' && getEOL(content) !== '\r\n') {
        // JS strings always use `\n` even on Windows, but when
        // writing to a file we want to use the system's EOL.
        content = content.replace(/\n/g, '\r\n');
    }
    await fs.promises.writeFile(file, content);
}

/**
 * Detects the EOL from the content of a string.
 * Will only look at the first line.
 * @param {string} content
 * @returns {string} EOL
 */
function getEOL(content) {
    const split = content.split('\n', 2);
    if (split.length === 1) {
        // There's no newlines, use the system's default
        return os.EOL
    }
    return split[0].endsWith('\r')
        ? '\r\n'
        : '\n';
}

/**
 * @param {string} package
 * @param {string} [version]
 * @returns {string} NPM URL
 */
function getNpmUrl(package, version) {
    let url = `https://www.npmjs.com/package/${getPackageName(package)}`;
    if (version) {
        url += `/v/${version}`;
    }
    return url;
}
