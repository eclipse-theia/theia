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
import { randomBytes } from 'crypto';
import * as os from 'os';
import * as path from 'path';
import { expect } from 'chai';
import { ILogger } from '@theia/core/lib/common/logger';
import { ArchiveExtractorImpl, ArchiveFormat } from './archive-extractor';
import { createTestTar, createTestZip } from './test/test-archives';

const isWindows = process.platform === 'win32';

describe('ArchiveExtractorImpl', () => {

    let workspace: string;
    let destination: string;
    let outside: string;
    let warnings: string[];

    class TestArchiveExtractor extends ArchiveExtractorImpl {
        override readonly logger = { warn: (message: string) => warnings.push(message) } as unknown as ILogger;
    }
    const extractor = new TestArchiveExtractor();

    beforeEach(async () => {
        workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'archive-extractor-'));
        destination = path.join(workspace, 'out');
        outside = path.join(workspace, 'outside');
        await fs.promises.mkdir(outside);
        warnings = [];
    });

    afterEach(async () => {
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

    async function writeArchive(name: string, content: Buffer): Promise<string> {
        const archivePath = path.join(workspace, name);
        await fs.promises.writeFile(archivePath, content);
        return archivePath;
    }

    const formats: { name: string, create: (entries: { name: string, type?: 'file' | 'directory', mode?: number, data?: string }[]) => Promise<Buffer> }[] = [
        {
            name: 'zip',
            create: async entries => createTestZip(entries.map(entry => ({
                name: entry.type === 'directory' ? entry.name + '/' : entry.name,
                mode: (entry.type === 'directory' ? 0o040000 : 0o100000) | (entry.mode ?? (entry.type === 'directory' ? 0o755 : 0o644)),
                data: entry.data
            })))
        },
        { name: 'tar', create: entries => createTestTar(entries) },
        { name: 'tgz', create: entries => createTestTar(entries, true) }
    ];

    for (const format of formats) {
        describe(format.name, () => {

            it('extracts files and directories from a path', async () => {
                const archive = await writeArchive(`archive.${format.name}`, await format.create([
                    { name: 'extension', type: 'directory' },
                    { name: 'extension/package.json', data: '{}' },
                    { name: 'extension/nested/file.txt', data: 'content' }
                ]));
                const entries = await extractor.extract(archive, destination);
                expect(entries.map(entry => `${entry.type}:${entry.path}`)).to.deep.equal([
                    'directory:extension',
                    'file:extension/package.json',
                    'file:extension/nested/file.txt'
                ]);
                expect(await fs.promises.readFile(path.join(destination, 'extension', 'nested', 'file.txt'), 'utf8')).to.equal('content');
            });

            it('extracts from a buffer', async () => {
                await extractor.extract(await format.create([{ name: 'file.txt', data: 'content' }]), destination);
                expect(await fs.promises.readFile(path.join(destination, 'file.txt'), 'utf8')).to.equal('content');
            });

            it('reads the selected files without extracting', async () => {
                const archive = await format.create([
                    { name: 'extension/package.json', data: '{"name":"test"}' },
                    { name: 'extension/README.md', data: 'readme' }
                ]);
                const files = await extractor.readFiles(archive, { filter: entryPath => entryPath === 'extension/package.json' });
                expect(files.map(file => [file.path, file.data.toString('utf8')])).to.deep.equal([['extension/package.json', '{"name":"test"}']]);
                expect(fs.existsSync(destination)).to.be.false;
            });

            (isWindows ? it.skip : it)('keeps permission bits but strips setuid, setgid and sticky bits', async () => {
                const entries = await extractor.extract(await format.create([
                    { name: 'run.sh', mode: 0o755, data: '#!/bin/sh' },
                    { name: 'setuid', mode: 0o7755, data: 'evil' }
                ]), destination);
                expect(entries.map(entry => entry.mode)).to.deep.equal([0o755, 0o755]);
                expect((await fs.promises.stat(path.join(destination, 'run.sh'))).mode & 0o7777).to.equal(0o755 & ~process.umask());
                expect((await fs.promises.stat(path.join(destination, 'setuid'))).mode & 0o7000).to.equal(0);
            });

            it('rejects an entry that leaves the destination', async () => {
                const archive = await format.create([{ name: '../outside/evil.txt', data: 'evil' }]);
                await expectRejection(extractor.extract(archive, destination), /invalid relative path|leaves the extraction directory/);
                expect(await listFiles(outside)).to.be.empty;
            });

            it('rejects an entry with an absolute path', async () => {
                const target = path.join(outside, 'evil.txt').split(path.sep).join('/');
                await expectRejection(extractor.extract(await format.create([{ name: target, data: 'evil' }]), destination), /absolute path/);
                expect(await listFiles(outside)).to.be.empty;
            });

            (isWindows ? it.skip : it)('does not write through a symlinked directory in the destination', async () => {
                await fs.promises.mkdir(destination);
                await fs.promises.symlink(outside, path.join(destination, 'link'));
                await expectRejection(extractor.extract(await format.create([{ name: 'link/evil.txt', data: 'evil' }]), destination), /leaves the extraction directory/);
                expect(await listFiles(outside)).to.be.empty;
            });

            (isWindows ? it.skip : it)('does not write through a symlinked file in the destination', async () => {
                const target = path.join(outside, 'target.txt');
                await fs.promises.writeFile(target, 'original');
                await fs.promises.mkdir(destination);
                await fs.promises.symlink(target, path.join(destination, 'file.txt'));
                await expectRejection(extractor.extract(await format.create([{ name: 'file.txt', data: 'evil' }]), destination), /ELOOP/);
                expect(await fs.promises.readFile(target, 'utf8')).to.equal('original');
            });

            it('accepts names that start with two dots', async () => {
                await extractor.extract(await format.create([
                    { name: '..config/settings.json', data: '{}' },
                    { name: '..hidden', data: 'hidden' }
                ]), destination);
                expect(await listFiles(destination)).to.deep.equal(['..config', '..config/settings.json', '..hidden']);
            });

            it('creates parent directories that have no entry of their own', async () => {
                const entries = await extractor.extract(await format.create([{ name: 'a/b/c.txt', data: 'content' }]), destination);
                expect(entries.map(entry => entry.path)).to.deep.equal(['a/b/c.txt']);
                expect(await fs.promises.readFile(path.join(destination, 'a', 'b', 'c.txt'), 'utf8')).to.equal('content');
            });

            it('overwrites existing files in the destination', async () => {
                await fs.promises.mkdir(destination);
                await fs.promises.writeFile(path.join(destination, 'file.txt'), 'old content that is longer');
                await extractor.extract(await format.create([{ name: 'file.txt', data: 'new' }]), destination);
                expect(await fs.promises.readFile(path.join(destination, 'file.txt'), 'utf8')).to.equal('new');
            });

            it('extracts long entry names', async () => {
                const longName = ['a'.repeat(80), 'b'.repeat(80), 'c'.repeat(80), 'file.txt'].join('/');
                await extractor.extract(await format.create([{ name: longName, data: 'long' }]), destination);
                expect(await fs.promises.readFile(path.join(destination, ...longName.split('/')), 'utf8')).to.equal('long');
            });

            it('extracts a large file', async () => {
                const data = randomBytes(3 * 1024 * 1024).toString('base64');
                await extractor.extract(await format.create([{ name: 'large.txt', data }]), destination);
                expect(await fs.promises.readFile(path.join(destination, 'large.txt'), 'utf8')).to.equal(data);
            });

            it('rejects a truncated archive', async () => {
                const archive = await format.create([{ name: 'file.txt', data: randomBytes(64 * 1024).toString('base64') }]);
                await expectRejection(extractor.extract(archive.subarray(0, archive.length / 2), destination), /end of (central directory|data|file)/i);
            });

            it('extracts an empty archive', async () => {
                const entries = await extractor.extract(await format.create([]), destination, { format: format.name as ArchiveFormat });
                expect(entries).to.be.empty;
                expect(await listFiles(destination)).to.be.empty;
            });

            (process.platform === 'linux' ? it : it.skip)('closes the archive file after a failed extraction', async () => {
                const archive = await writeArchive(`archive.${format.name}`, await format.create([
                    { name: 'file.txt', data: 'content' },
                    { name: '../outside/evil.txt', data: 'evil' }
                ]));
                const openBefore = (await fs.promises.readdir('/proc/self/fd')).length;
                await expectRejection(extractor.extract(archive, destination), /invalid relative path|leaves the extraction directory/);
                expect((await fs.promises.readdir('/proc/self/fd')).length).to.equal(openBefore);
            });
        });
    }

    describe('zip entries', () => {

        (isWindows ? it.skip : it)('uses default permissions for entries without a Unix mode', async () => {
            const entries = await extractor.extract(createTestZip([{ name: 'file.txt', mode: 0, data: 'content' }]), destination);
            expect(entries.map(entry => entry.mode)).to.deep.equal([undefined]);
            expect((await fs.promises.stat(path.join(destination, 'file.txt'))).mode & 0o777).to.equal(0o666 & ~process.umask());
        });

        it('accepts backslashes as separators', async () => {
            await extractor.extract(createTestZip([{ name: 'dir\\file.txt', data: 'content' }]), destination);
            expect(await listFiles(destination)).to.deep.equal(['dir', 'dir/file.txt']);
        });

        it('rejects an entry that leaves the destination with backslashes', async () => {
            await expectRejection(extractor.extract(createTestZip([{ name: '..\\outside\\evil.txt', data: 'evil' }]), destination),
                /invalid relative path|leaves the extraction directory/);
            expect(await listFiles(outside)).to.be.empty;
        });
    });

    describe('zip links', () => {

        it('skips a symlink entry', async () => {
            const entries = await extractor.extract(createTestZip([
                { name: 'link', mode: 0o120777, data: outside },
                { name: 'file.txt', data: 'content' }
            ]), destination);
            expect(entries.map(entry => entry.path)).to.deep.equal(['file.txt']);
            expect(await listFiles(destination)).to.deep.equal(['file.txt']);
            expect(warnings.join()).to.contain('link');
        });

        it('keeps a file inside the destination when it follows a symlink entry of the same name', async () => {
            await extractor.extract(createTestZip([
                { name: 'link', mode: 0o120777, data: outside },
                { name: 'link/evil.txt', data: 'evil' }
            ]), destination);
            expect(await listFiles(destination)).to.deep.equal(['link', 'link/evil.txt']);
            expect(await listFiles(outside)).to.be.empty;
        });
    });

    describe('tar links', () => {

        it('skips a chain of symlink entries', async () => {
            await extractor.extract(await createTestTar([
                { name: 'a', type: 'symlink', linkname: '..' },
                { name: 'a/b', type: 'symlink', linkname: '../outside' },
                { name: 'a/b/evil.txt', data: 'evil' }
            ]), destination);
            expect(await listFiles(destination)).to.deep.equal(['a', 'a/b', 'a/b/evil.txt']);
            expect(await listFiles(outside)).to.be.empty;
        });

        it('skips a hardlink entry', async () => {
            const target = path.join(outside, 'secret.txt');
            await fs.promises.writeFile(target, 'secret');
            const entries = await extractor.extract(await createTestTar([
                { name: 'secret.txt', type: 'link', linkname: target },
                { name: 'file.txt', data: 'content' }
            ]), destination);
            expect(entries.map(entry => entry.path)).to.deep.equal(['file.txt']);
            expect(await listFiles(destination)).to.deep.equal(['file.txt']);
            expect(warnings.join()).to.contain('secret.txt');
        });

        it('skips special entries', async () => {
            const entries = await extractor.extract(await createTestTar([
                { name: 'pipe', type: 'fifo' },
                { name: 'file.txt', data: 'content' }
            ]), destination);
            expect(entries.map(entry => entry.path)).to.deep.equal(['file.txt']);
        });

        it('reports links that are skipped while reading files', async () => {
            const files = await extractor.readFiles(await createTestTar([
                { name: 'link', type: 'symlink', linkname: '/etc/passwd' },
                { name: 'file.txt', data: 'content' }
            ]));
            expect(files.map(file => file.path)).to.deep.equal(['file.txt']);
            expect(warnings.join()).to.contain('link');
        });
    });

    it('rejects an unsupported format', async () => {
        await expectRejection(extractor.extract(Buffer.from('not an archive'), destination), /Unsupported archive format/);
    });

    it('uses the given format instead of detecting it', async () => {
        await expectRejection(extractor.extract(createTestZip([{ name: 'file.txt' }]), destination, { format: 'tgz' }), /incorrect header check/);
    });
});
