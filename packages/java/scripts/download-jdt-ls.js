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
const request = require('request');
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
if (process.env.JAVA_LS_DOWNLOAD_URL) {
    downloadUrl = process.env.JAVA_LS_DOWNLOAD_URL;
}
const downloadUrlHash = sha1(downloadUrl);
const filename = `jdt.ls-${downloadUrlHash}`;
const downloadDir = 'download';
const downloadPath = path.join(packagePath, downloadDir);
const downloadHistoryPath = path.join(downloadPath, 'download-history.json');
const archivePath = path.join(downloadPath, filename);
const targetPath = path.join(packagePath, 'server');

function downloadJavaServer() {
	if (fs.existsSync(archivePath)) {
        return;
    }
    if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath);
    }
    const file = fs.createWriteStream(archivePath);    
    const req = request.get(downloadUrl)
        .on('response', function(response) {
            if (response.statusCode === 200) {
                req.pipe(file).on('finish', function() {
                	console.log('Successfully downloaded Java LS');
                    updateDownloadHistory();
                    shared.decompressArchive(archivePath, targetPath);
                });
            } else {
                console.error(`Failed to download Java LS with code: ${response.statusCode}`);
                process.exitCode = 1;
                file.destroy();
                fs.unlinkSync(archivePath);
            }
        }).on('error', function(err) {
            console.error('Failed to download Java LS: ' + err);
            process.exitCode = 1;
            file.destroy();
            fs.unlinkSync(archivePath);
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

downloadJavaServer();
