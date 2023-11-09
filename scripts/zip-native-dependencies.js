// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

const { promisify } = require('util');
const glob = promisify(require('glob'));
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

async function run() {
    const repoPath = path.resolve(__dirname, '..');
    const zipFile = path.join(__dirname, `native-dependencies-${process.platform}-${process.arch}.zip`);
    const browserAppPath = path.join(repoPath, 'examples', 'browser');
    const nativeDependencies = await glob('lib/backend/native/**', {
        cwd: browserAppPath
    });
    const buildDependencies = await glob('lib/build/Release/**', {
        cwd: browserAppPath
    });
    const trashDependencies = await glob('lib/backend/{windows-trash.exe,macos-trash}', {
        cwd: browserAppPath
    });
    const archive = archiver('zip');
    const output = fs.createWriteStream(zipFile, { flags: "w" });
    archive.pipe(output);
    for (const file of [
        ...nativeDependencies,
        ...buildDependencies,
        ...trashDependencies
    ]) {
        const filePath = path.join(browserAppPath, file);
        archive.file(filePath, {
            name: file,
            mode: (await fs.promises.stat(filePath)).mode
        });
    }
    await archive.finalize();
}

run();
