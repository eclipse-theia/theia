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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

const execSync = require('child_process').execSync;
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

const modulesToBuild = [
    { name: "cpu-features", files: ['build/Release/cpufeatures.node'] },
    { name: "drivelist", files: ['build/Release/drivelist.node'] },
    { name: "find-git-repositories", files: ['build/Release/findGitRepos.node'] },
    { name: "keytar", files: ['build/Release/keytar.node'] },
    { name: "nsfw", files: ['build/Release/nsfw.node'] },
    { name: "node-pty", files: ['build/Release/pty.node', 'build/Release/spawn-helper', 'build/Release/winpty-agent.exe', 'build/Release/winpty.dll'] },
]

const artifactsPath = path.join(process.cwd(), 'artifacts');

if (fs.existsSync(artifactsPath)) {
    fs.rmSync(artifactsPath, { recursive: true });
}

for (let module of modulesToBuild) {
    const modulePath = path.join(process.cwd(), 'node_modules', module.name);
    console.log(modulePath)
    execSync('node-gyp rebuild', { cwd: modulePath, stdio: 'inherit' });
    const dstDir = path.join(artifactsPath, module.name);
    for (let file of module.files) {
        if (!fs.existsSync(dstDir)) {
            fs.mkdirSync(dstDir, { recursive: true });
        }
        const fileToCopy = path.join(modulePath.toString(), file)
        if (fs.existsSync(fileToCopy)) {
            fs.copyFileSync(fileToCopy, path.join(dstDir, path.basename(file)));
        }
    }
    const archive = archiver('zip');
    const output = fs.createWriteStream(path.join(artifactsPath, `${module.name}-${process.platform}-${process.arch}.zip`), { flags: "w" });
    archive.pipe(output);
    archive.directory(dstDir, false);
    archive.finalize();
}
