/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

const tar = require('tar');
const zlib = require('zlib');
const fs = require('fs');
const mkdirp = require('mkdirp');

exports.decompressArchive = function (archivePath, targetPath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(archivePath)) {
            reject(new Error("archive not found"));
            return;
        }
        if (!fs.existsSync(targetPath)) {
            mkdirp.sync(targetPath);
        }
        const gunzip = zlib.createGunzip({ finishFlush: zlib.Z_SYNC_FLUSH, flush: zlib.Z_SYNC_FLUSH });
        console.log(targetPath);
        const untar = tar.x({ cwd: targetPath });
        fs.createReadStream(archivePath).pipe(gunzip).pipe(untar)
            .on("error", e => reject(e))
            .on("end", () => resolve());
    });
}
