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

const tar = require('tar');
const zlib = require('zlib');
const fs = require('fs');
const mkdirp = require('mkdirp');

exports.decompressArchive = function (archivePath, targetPath) {
    return new Promise((resolve, reject) => {
        if (!fs.existsSync(archivePath)) {
            reject(new Error(`The archive was not found at ${archivePath}.`));
            return;
        }
        if (!fs.existsSync(targetPath)) {
            mkdirp.sync(targetPath);
        }
        const gunzip = zlib.createGunzip({ finishFlush: zlib.Z_SYNC_FLUSH, flush: zlib.Z_SYNC_FLUSH });
        console.log(`Decompressing the archive to ${targetPath}.`);
        const untar = tar.x({ cwd: targetPath });
        fs.createReadStream(archivePath).pipe(gunzip).pipe(untar)
            .on('error', e => reject(e))
            .on('end', () => resolve());
    });
}
