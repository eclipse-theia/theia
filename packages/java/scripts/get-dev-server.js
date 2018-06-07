/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// @ts-check

const fs = require('fs');
const process = require('child_process');
const path = require('path');
const https = require('https');


// @ts-ignore
const package = require('../package.json');
const shared = require('./shared');

const devVersion = package.ls.dev.version;
const packagePath = path.join(__dirname, "..");
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
