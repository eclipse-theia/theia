/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
const process = require('child_process');
const path = require('path');
const https = require('https');


// @ts-ignore
const package = require('../package.json');
const shared = require('./shared');

const devVersion = package.ls.dev.version;
const packagePath = path.join(__dirname, '..');
const targetPath = path.join(packagePath, 'server');
const archiveName = `jdt.ls.extension.product-${devVersion}.tar.gz`;
const downloadDir = 'download';
const downloadPath = path.join(packagePath, downloadDir);
const archivePath = path.join(downloadPath, archiveName);

function getDevServer() {
    return new Promise((resolve, reject) => {
        const command = 'mvn dependency:copy ';
        console.log('executing ' + command);
        process.exec(command, { cwd: __dirname }, () => {
            if (fs.existsSync(archivePath)) {
                resolve(archivePath);
            } else {
                reject(new Error('Archive file not found: ' + archivePath));
            }
        });
    });
}

getDevServer().then((archivePath) => {
    shared.decompressArchive(archivePath, targetPath);
});
