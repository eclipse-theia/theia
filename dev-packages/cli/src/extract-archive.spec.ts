// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { crc32, gzipSync } from 'zlib';
import * as tarStream from 'tar-stream';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { ArchiveFormat, extractArchive, readArchiveFiles } from './extract-archive';

const isWindows = process.platform === 'win32';

interface TestEntry {
    name: string;
    type?: 'file' | 'directory' | 'symlink' | 'link';
    /** Permission bits, without the file type. */
    mode?: number;
    linkname?: string;
    data?: string;
}

/**
 * Builds a zip archive with stored entries, writing names and modes as given. Mirrors the test archives of
 * `@theia/filesystem`, which the CLI cannot depend on.
 */
function createZip(entries: TestEntry[]): Buffer {
    const fileTypes = { file: 0o100000, directory: 0o040000, symlink: 0o120000, link: 0o100000 };
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;
    for (const entry of entries) {
        const type = entry.type ?? 'file';
        const name = Buffer.from(type === 'directory' ? entry.name + '/' : entry.name, 'utf8');
        const data = Buffer.from(type === 'symlink' ? entry.linkname ?? '' : entry.data ?? '', 'utf8');
        const checksum = crc32(data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6);
        local.writeUInt16LE(0x21, 12);
        local.writeUInt32LE(checksum, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        localParts.push(local, name, data);
        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE((3 << 8) | 20, 4);
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(0x21, 14);
        central.writeUInt32LE(checksum, 16);
        central.writeUInt32LE(data.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(((fileTypes[type] | (entry.mode ?? (type === 'file' ? 0o644 : 0o755))) << 16) >>> 0, 38);
        central.writeUInt32LE(offset, 42);
        centralParts.push(central, name);
        offset += local.length + name.length + data.length;
    }
    const centralDirectory = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralDirectory.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...localParts, centralDirectory, end]);
}

async function createTgz(entries: TestEntry[]): Promise<Buffer> {
    const pack = tarStream.pack();
    const chunks: Buffer[] = [];
    const collected = (async () => {
        for await (const chunk of pack) {
            chunks.push(chunk as Buffer);
        }
    })();
    for (const entry of entries) {
        await new Promise<void>((resolve, reject) => {
            const header = { name: entry.name, type: entry.type ?? 'file', mode: entry.mode, linkname: entry.linkname };
            pack.entry(header, entry.data ?? '', error => error ? reject(error) : resolve());
        });
    }
    pack.finalize();
    await collected;
    return gzipSync(Buffer.concat(chunks));
}

describe('extract-archive', () => {

    let workspace: string;
    let destination: string;
    let outside: string;
    let warnings: string[];
    const originalWarn = console.warn;

    beforeEach(async () => {
        workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'cli-extract-archive-'));
        destination = path.join(workspace, 'out');
        outside = path.join(workspace, 'outside');
        await fs.promises.mkdir(outside);
        warnings = [];
        console.warn = (message: string) => warnings.push(message);
    });

    afterEach(async () => {
        console.warn = originalWarn;
        await fs.promises.rm(workspace, { recursive: true, force: true });
    });

    async function expectRejection(promise: Promise<unknown>, message: RegExp): Promise<void> {
        try {
            await promise;
        } catch (error) {
            expect(String(error)).to.match(message);
            return;
        }
        expect.fail('Expected the promise to be rejected');
    }

    async function listFiles(directory: string): Promise<string[]> {
        const entries = await fs.promises.readdir(directory, { recursive: true });
        return entries.map(entry => entry.split(path.sep).join('/')).sort();
    }

    /** Creating a file link on Windows requires elevated rights or developer mode. */
    async function createFileLink(target: string, link: string): Promise<boolean> {
        try {
            await fs.promises.symlink(target, link, 'file');
            return true;
        } catch (error) {
            if (isWindows && (error as NodeJS.ErrnoException).code === 'EPERM') {
                return false;
            }
            throw error;
        }
    }

    const formats: { format: ArchiveFormat, create: (entries: TestEntry[]) => Promise<Buffer> }[] = [
        { format: 'zip', create: async entries => createZip(entries) },
        { format: 'tgz', create: createTgz }
    ];

    for (const { format, create } of formats) {
        describe(format, () => {

            it('extracts files and directories', async () => {
                await extractArchive(await create([
                    { name: 'extension', type: 'directory' },
                    { name: 'extension/package.json', data: '{}' },
                    { name: 'extension/out/main.js', data: 'main' }
                ]), destination, format);
                expect(await listFiles(destination)).to.deep.equal(['extension', 'extension/out', 'extension/out/main.js', 'extension/package.json']);
                expect(await fs.promises.readFile(path.join(destination, 'extension', 'out', 'main.js'), 'utf8')).to.equal('main');
            });

            it('reads all files without extracting', async () => {
                const files = await readArchiveFiles(await create([
                    { name: 'bundle', type: 'directory' },
                    { name: 'bundle/a.vsix', data: 'a' },
                    { name: 'bundle/b.vsix', data: 'b' }
                ]), format);
                expect(files.map(file => [file.path, file.data.toString('utf8')])).to.deep.equal([['bundle/a.vsix', 'a'], ['bundle/b.vsix', 'b']]);
                expect(fs.existsSync(destination)).to.be.false;
            });

            it('accepts names that start with two dots', async () => {
                await extractArchive(await create([{ name: '..config/settings.json', data: '{}' }]), destination, format);
                expect(await listFiles(destination)).to.deep.equal(['..config', '..config/settings.json']);
            });

            (isWindows ? it.skip : it)('keeps permission bits but strips setuid, setgid and sticky bits', async () => {
                await extractArchive(await create([
                    { name: 'run.sh', mode: 0o755, data: '#!/bin/sh' },
                    { name: 'setuid', mode: 0o7755, data: 'evil' }
                ]), destination, format);
                expect((await fs.promises.stat(path.join(destination, 'run.sh'))).mode & 0o7777).to.equal(0o755 & ~process.umask());
                expect((await fs.promises.stat(path.join(destination, 'setuid'))).mode & 0o7000).to.equal(0);
            });

            it('rejects an entry that leaves the destination', async () => {
                await expectRejection(extractArchive(await create([{ name: '../outside/evil.txt', data: 'evil' }]), destination, format),
                    /invalid relative path|leaves the extraction directory/);
                expect(await listFiles(outside)).to.be.empty;
            });

            it('rejects an entry with an absolute path', async () => {
                const target = path.join(outside, 'evil.txt').split(path.sep).join('/');
                await expectRejection(extractArchive(await create([{ name: target, data: 'evil' }]), destination, format), /absolute path/);
                expect(await listFiles(outside)).to.be.empty;
            });

            it('does not write through a symlinked directory in the destination', async () => {
                await fs.promises.mkdir(destination);
                await fs.promises.symlink(outside, path.join(destination, 'link'), 'junction');
                await expectRejection(extractArchive(await create([{ name: 'link/evil.txt', data: 'evil' }]), destination, format), /leaves the extraction directory/);
                expect(await listFiles(outside)).to.be.empty;
            });

            it('does not create directories through a symlinked directory in the destination', async () => {
                await fs.promises.mkdir(destination);
                await fs.promises.symlink(outside, path.join(destination, 'link'), 'junction');
                await expectRejection(extractArchive(await create([{ name: 'link/new-directory/evil.txt', data: 'evil' }]), destination, format),
                    /leaves the extraction directory/);
                expect(await listFiles(outside)).to.be.empty;
            });

            it('does not write through a symlinked file in the destination', async function (): Promise<void> {
                const target = path.join(outside, 'target.txt');
                await fs.promises.writeFile(target, 'original');
                await fs.promises.mkdir(destination);
                if (!await createFileLink(target, path.join(destination, 'file.txt'))) {
                    this.skip();
                }
                await expectRejection(extractArchive(await create([{ name: 'file.txt', data: 'evil' }]), destination, format), /written through a link/);
                expect(await fs.promises.readFile(target, 'utf8')).to.equal('original');
            });

            it('does not write a file whose existing target cannot be inspected', async () => {
                await fs.promises.mkdir(destination);
                const target = path.join(await fs.promises.realpath(destination), 'file.txt');
                await fs.promises.writeFile(target, 'original');
                const lstat = sinon.stub(fs.promises, 'lstat').callThrough();
                lstat.withArgs(target).rejects(Object.assign(new Error('EACCES: permission denied'), { code: 'EACCES' }));
                try {
                    await expectRejection(extractArchive(await create([{ name: 'file.txt', data: 'evil' }]), destination, format), /EACCES/);
                } finally {
                    lstat.restore();
                }
                expect(await fs.promises.readFile(target, 'utf8')).to.equal('original');
            });

            it('skips a symlink entry and keeps a file of the same name inside the destination', async () => {
                await extractArchive(await create([
                    { name: 'link', type: 'symlink', linkname: outside },
                    { name: 'link/evil.txt', data: 'evil' }
                ]), destination, format);
                expect(await listFiles(destination)).to.deep.equal(['link', 'link/evil.txt']);
                expect(await listFiles(outside)).to.be.empty;
                expect(warnings.join()).to.contain('link');
            });

            it('skips links while reading files', async () => {
                const files = await readArchiveFiles(await create([
                    { name: 'link', type: 'symlink', linkname: '/etc/passwd' },
                    { name: 'file.txt', data: 'content' }
                ]), format);
                expect(files.map(file => file.path)).to.deep.equal(['file.txt']);
                expect(warnings.join()).to.contain('link');
            });

            it('rejects a truncated archive', async () => {
                const archive = await create([{ name: 'file.txt', data: 'x'.repeat(64 * 1024) }]);
                await expectRejection(extractArchive(archive.subarray(0, archive.length / 2), destination, format), /end of (central directory|data|file)/i);
            });
        });
    }

    it('skips a hardlink entry', async () => {
        const target = path.join(outside, 'secret.txt');
        await fs.promises.writeFile(target, 'secret');
        await extractArchive(await createTgz([
            { name: 'secret.txt', type: 'link', linkname: target },
            { name: 'file.txt', data: 'content' }
        ]), destination, 'tgz');
        expect(await listFiles(destination)).to.deep.equal(['file.txt']);
        expect(warnings.join()).to.contain('secret.txt');
    });

    it('uses the given format', async () => {
        await expectRejection(extractArchive(createZip([{ name: 'file.txt' }]), destination, 'tgz'), /incorrect header check/);
    });
});
