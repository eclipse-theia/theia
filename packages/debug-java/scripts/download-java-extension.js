/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const pck = require('../package.json');
const packagePath = path.join(__dirname, '..');
const downloadUrl = pck.javaExtension.downloadUrl;
const filename = 'java-debug.jar';
const downloadDir = 'download';
const downloadPath = path.join(packagePath, downloadDir);
const archivePath = path.join(downloadPath, filename);

function downloadJavaDebug() {
    return new Promise((resolve, reject) => {
        if (fs.existsSync(archivePath)) {
            resolve();
            return;
        }
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath);
        }
        const file = fs.createWriteStream(archivePath);
        const downloadWithRedirect = url => {
            /** @type { any } */
            const h = url.toString().startsWith('https') ? https : http;
            h.get(url, response => {
                const statusCode = response.statusCode;
                const redirectLocation = response.headers.location;
                if (statusCode >= 300 && statusCode < 400 && redirectLocation) {
                    console.log('Redirect location: ' + redirectLocation);
                    downloadWithRedirect(redirectLocation);
                } else if (statusCode === 200) {
                    response.on('end', () => resolve());
                    response.on('error', e => {
                        file.destroy();
                        reject(e);
                    });
                    response.pipe(file);
                } else {
                    file.destroy();
                    reject(new Error(`Failed to download Java Debug with code: ${statusCode}`));
                }
            })

        };
        downloadWithRedirect(downloadUrl);
    });
}

downloadJavaDebug();
