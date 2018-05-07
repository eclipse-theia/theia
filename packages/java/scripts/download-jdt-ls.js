/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */


// @ts-check

const fs = require('fs');
const mkdirp = require('mkdirp')
const https = require('https');
const http = require('http');
const path = require('path');
const tar = require('tar');
const zlib = require('zlib');

// @ts-ignore
const packageJson = require('../package.json');
const packagePath = path.join(__dirname, "..");
const serverPath = packageJson['jdt.ls.download.path'] || '/jdtls/snapshots/jdt-language-server-latest.tar.gz';
const archiveUri = `https://www.eclipse.org/downloads/download.php?file=${serverPath}&r=1`;
const filename = path.basename(serverPath);
const downloadDir = 'download';
const downloadPath = path.join(packagePath, downloadDir);
const archivePath = path.join(downloadPath, filename);
const targetPath = path.join(packagePath, 'server');

function decompressArchive() {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(archivePath)) {
            reject("archive not found");
            return;
        }
        if (!fs.existsSync(targetPath)) {
            mkdirp.sync(targetPath);
        }
        const gunzip = zlib.createGunzip({ finishFlush: zlib.Z_SYNC_FLUSH, flush: zlib.Z_SYNC_FLUSH });
        console.log(targetPath);
        const untar = tar.x({ cwd: targetPath });
        fs.createReadStream(archivePath).pipe(gunzip).pipe(untar)
            .on("error", e => reject("failed to decompress archive: " + e))
            .on("end", () => resolve());
    });
}

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
            const h = url.toString().startsWith("https") ? https : http;
            h.get(url, response => {
                const statusCode = response.statusCode;
                const redirectLocation = response.headers.location;
                if (statusCode >= 300 && statusCode < 400 && redirectLocation) {
                    console.log("redirect location: " + redirectLocation)
                    downloadWithRedirect(redirectLocation);
                } else if (statusCode === 200) {
                    response.on("end", e => resolve());
                    response.on("error", e => {
                        file.destroy();
                        reject("failed to download with code");
                    });
                    response.pipe(file);
                } else {
                    file.destroy();
                    reject("failed to download with code: " + statusCode);
                }
            })

        };
        downloadWithRedirect(archiveUri);
    });
}

downloadJavaServer().then(() => {
    decompressArchive();
}).catch(error => {
    console.error(error);
    process.exit(1);
});