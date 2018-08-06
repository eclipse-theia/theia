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
const https = require('https');
const http = require('http');
const path = require('path');
const sha1 = require('sha1');

// @ts-ignore
const packageJson = require('../package.json');
const shared = require('./shared');
const packagePath = path.join(__dirname, '..');
let downloadUrl = 'https://www.eclipse.org/downloads/download.php?file=/che/che-ls-jdt/snapshots/che-jdt-language-server-latest.tar.gz&r=1';
if (packageJson.ls && packageJson.ls.downloadUrl) {
    downloadUrl = packageJson.ls.downloadUrl;
}
const downloadUrlHash = sha1(downloadUrl);
const filename = `jdt.ls-${downloadUrlHash}`;
const downloadDir = 'download';
const downloadPath = path.join(packagePath, downloadDir);
const downloadHistoryPath = path.join(downloadPath, 'download-history.json');
const archivePath = path.join(downloadPath, filename);
const targetPath = path.join(packagePath, 'server');

function downloadJavaServer() {
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
                    console.log("redirect location: " + redirectLocation)
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
                    reject(new Error(`Failed to download Java LS with code: ${statusCode}`));
                }
            })

        };
        downloadWithRedirect(downloadUrl);
    });
}

// Just to make sure we can reverse-engineer the download URL from the hash of the file name.
function updateDownloadHistory() {
    if (!fs.existsSync(downloadHistoryPath)) {
        fs.writeFileSync(downloadHistoryPath, '{}', { encoding: 'utf8' });
    }
    const downloadHistory = JSON.parse(fs.readFileSync(downloadHistoryPath, { encoding: 'utf8' }));
    downloadHistory[filename] = downloadUrl;
    fs.writeFileSync(downloadHistoryPath, JSON.stringify(downloadHistory, null, 4), { encoding: 'utf8' });
}

downloadJavaServer().then(() => {
    updateDownloadHistory();
    shared.decompressArchive(archivePath, targetPath);
}).catch(error => {
    console.error(error);
    process.exit(1);
});