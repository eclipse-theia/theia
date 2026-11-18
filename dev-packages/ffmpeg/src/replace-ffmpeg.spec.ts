// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as sinon from 'sinon';
import { crc32 } from 'zlib';
import electronGet = require('@electron/get');
import os = require('os');
import { replaceFfmpeg } from './replace-ffmpeg';

function createZipBuffer(fileName: string, content: Buffer): Buffer {
    const name = Buffer.from(fileName, 'utf8');
    const checksum = crc32(content);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(content.length, 18);
    localHeader.writeUInt32LE(content.length, 22);
    localHeader.writeUInt16LE(name.length, 26);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(content.length, 20);
    centralHeader.writeUInt32LE(content.length, 24);
    centralHeader.writeUInt16LE(name.length, 28);
    centralHeader.writeUInt32LE(0, 42);

    const centralOffset = localHeader.length + name.length + content.length;
    const centralSize = centralHeader.length + name.length;

    const endRecord = Buffer.alloc(22);
    endRecord.writeUInt32LE(0x06054b50, 0);
    endRecord.writeUInt16LE(1, 8);
    endRecord.writeUInt16LE(1, 10);
    endRecord.writeUInt32LE(centralSize, 12);
    endRecord.writeUInt32LE(centralOffset, 16);

    return Buffer.concat([localHeader, name, content, centralHeader, name, endRecord]);
}

describe('replaceFfmpeg', () => {

    let tempRoot: string;
    let cacheTmpDir: string;
    let downloadCounter: number;

    beforeEach(async () => {
        tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'theia-ffmpeg-test-'));
        cacheTmpDir = path.join(tempRoot, 'tmp');
        await fs.promises.mkdir(cacheTmpDir, { recursive: true });
        sinon.stub(os, 'tmpdir').returns(cacheTmpDir);
        sinon.stub(console, 'warn');
        downloadCounter = 0;
    });

    afterEach(async () => {
        sinon.restore();
        await fs.promises.rm(tempRoot, { recursive: true, force: true });
    });

    async function createTargetFfmpeg(dirName: string, fileName: string, initialContent = 'original'): Promise<string> {
        const target = path.join(tempRoot, dirName, fileName);
        await fs.promises.mkdir(path.dirname(target), { recursive: true });
        await fs.promises.writeFile(target, initialContent);
        return target;
    }

    function stubDownloads(payloadByKey: Record<string, { fileName: string, content: string }>): sinon.SinonStub {
        return sinon.stub(electronGet, 'downloadArtifact').callsFake(async details => {
            const platform = 'platform' in details && details.platform ? details.platform : process.platform;
            const arch = 'arch' in details && details.arch ? details.arch : process.arch;
            const key = `${details.version}:${platform}:${arch}`;
            const payload = payloadByKey[key];
            if (!payload) {
                throw new Error(`Unexpected download request for ${key}`);
            }
            const zipPath = path.join(tempRoot, `download-${++downloadCounter}.zip`);
            await fs.promises.writeFile(zipPath, createZipBuffer(payload.fileName, Buffer.from(payload.content)));
            return zipPath;
        });
    }

    it('does not reuse an arm64 macOS cache entry for an x64 build of the same Electron version', async () => {
        sinon.stub(process, 'platform').value('darwin');
        const downloadStub = stubDownloads({
            '44.0.0:darwin:arm64': { fileName: 'libffmpeg.dylib', content: 'ffmpeg-darwin-arm64' },
            '44.0.0:darwin:x64': { fileName: 'libffmpeg.dylib', content: 'ffmpeg-darwin-x64' }
        });

        const arm64Target = await createTargetFfmpeg('dist-arm64', 'libffmpeg.dylib');
        const x64Target = await createTargetFfmpeg('dist-x64', 'libffmpeg.dylib');

        sinon.stub(process, 'arch').value('arm64');
        await replaceFfmpeg({ electronVersion: '44.0.0', ffmpegPath: arm64Target });
        expect(await fs.promises.readFile(arm64Target, 'utf8')).to.equal('ffmpeg-darwin-arm64');

        sinon.stub(process, 'arch').value('x64');
        await replaceFfmpeg({ electronVersion: '44.0.0', ffmpegPath: x64Target });
        expect(await fs.promises.readFile(x64Target, 'utf8')).to.equal('ffmpeg-darwin-x64');

        expect(fs.existsSync(path.join(cacheTmpDir, 'theia-cli/cache/electron-v44.0.0-darwin-arm64/libffmpeg.dylib'))).to.be.true;
        expect(fs.existsSync(path.join(cacheTmpDir, 'theia-cli/cache/electron-v44.0.0-darwin-x64/libffmpeg.dylib'))).to.be.true;
        expect(downloadStub.callCount).to.equal(2);
    });

    it('reuses the matching platform and architecture cache on subsequent runs', async () => {
        sinon.stub(process, 'platform').value('darwin');
        const downloadStub = stubDownloads({
            '44.0.0:darwin:arm64': { fileName: 'libffmpeg.dylib', content: 'ffmpeg-darwin-arm64' },
            '44.0.0:darwin:x64': { fileName: 'libffmpeg.dylib', content: 'ffmpeg-darwin-x64' }
        });

        const arm64First = await createTargetFfmpeg('dist-arm64-1', 'libffmpeg.dylib');
        const arm64Second = await createTargetFfmpeg('dist-arm64-2', 'libffmpeg.dylib');
        const x64First = await createTargetFfmpeg('dist-x64-1', 'libffmpeg.dylib');
        const x64Second = await createTargetFfmpeg('dist-x64-2', 'libffmpeg.dylib');

        sinon.stub(process, 'arch').value('arm64');
        await replaceFfmpeg({ electronVersion: '44.0.0', ffmpegPath: arm64First });
        await replaceFfmpeg({ electronVersion: '44.0.0', ffmpegPath: arm64Second });

        sinon.stub(process, 'arch').value('x64');
        await replaceFfmpeg({ electronVersion: '44.0.0', ffmpegPath: x64First });
        await replaceFfmpeg({ electronVersion: '44.0.0', ffmpegPath: x64Second });

        expect(await fs.promises.readFile(arm64Second, 'utf8')).to.equal('ffmpeg-darwin-arm64');
        expect(await fs.promises.readFile(x64Second, 'utf8')).to.equal('ffmpeg-darwin-x64');
        expect(downloadStub.callCount).to.equal(2);
    });

    it('separates caches across platforms for the same architecture and Electron version', async () => {
        sinon.stub(process, 'arch').value('x64');
        const downloadStub = stubDownloads({
            '44.0.0:linux:x64': { fileName: 'libffmpeg.so', content: 'ffmpeg-linux-x64' },
            '44.0.0:win32:x64': { fileName: 'ffmpeg.dll', content: 'ffmpeg-win32-x64' }
        });

        const linuxTarget = await createTargetFfmpeg('dist-linux', 'libffmpeg.so');
        const winTarget = await createTargetFfmpeg('dist-win', 'ffmpeg.dll');

        await replaceFfmpeg({ electronVersion: '44.0.0', platform: 'linux', ffmpegPath: linuxTarget });
        await replaceFfmpeg({ electronVersion: '44.0.0', platform: 'win32', ffmpegPath: winTarget });

        expect(await fs.promises.readFile(linuxTarget, 'utf8')).to.equal('ffmpeg-linux-x64');
        expect(await fs.promises.readFile(winTarget, 'utf8')).to.equal('ffmpeg-win32-x64');
        expect(downloadStub.callCount).to.equal(2);
    });

    it('uses explicit arch option to isolate caches even under the same process.arch', async () => {
        sinon.stub(process, 'platform').value('darwin');
        sinon.stub(process, 'arch').value('arm64');
        const downloadStub = stubDownloads({
            '44.0.0:darwin:arm64': { fileName: 'libffmpeg.dylib', content: 'ffmpeg-darwin-arm64' },
            '44.0.0:darwin:x64': { fileName: 'libffmpeg.dylib', content: 'ffmpeg-darwin-x64' }
        });

        const arm64Target = await createTargetFfmpeg('dist-explicit-arm64', 'libffmpeg.dylib');
        const x64Target = await createTargetFfmpeg('dist-explicit-x64', 'libffmpeg.dylib');

        await replaceFfmpeg({ electronVersion: '44.0.0', arch: 'arm64', ffmpegPath: arm64Target });
        await replaceFfmpeg({ electronVersion: '44.0.0', arch: 'x64', ffmpegPath: x64Target });

        expect(await fs.promises.readFile(arm64Target, 'utf8')).to.equal('ffmpeg-darwin-arm64');
        expect(await fs.promises.readFile(x64Target, 'utf8')).to.equal('ffmpeg-darwin-x64');
        expect(downloadStub.callCount).to.equal(2);
    });
});
