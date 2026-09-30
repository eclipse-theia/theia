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

import { Container } from '@theia/core/shared/inversify';
import { URI } from '@theia/core';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { expect } from 'chai';
import { FileChange, FileChangeType, FileSystemProviderError, FileSystemProviderErrorCode, FileType } from '../../common/files';
import { LocalDirectoryFileSystemProvider, LocalDirectoryFileSystemProviderOptions } from './local-directory-file-system-provider';
import { addInMemoryFile, createInMemoryDirectoryHandle } from './test/in-memory-directory-handle';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function uri(path: string): URI {
    return new URI('file://').withPath(path);
}

async function expectError(promise: Promise<unknown>, code: FileSystemProviderErrorCode): Promise<void> {
    try {
        await promise;
    } catch (error) {
        expect(error).to.be.instanceOf(FileSystemProviderError);
        expect((error as FileSystemProviderError).code).to.equal(code);
        return;
    }
    expect.fail(`expected an error with code ${code}`);
}

describe('LocalDirectoryFileSystemProvider', () => {

    let root: FileSystemDirectoryHandle;
    let provider: LocalDirectoryFileSystemProvider;
    let changes: FileChange[];

    function summarize(): [string, FileChangeType][] {
        return changes.map(change => [change.resource.path.toString(), change.type]);
    }

    async function setup(supportsMove: boolean): Promise<void> {
        root = createInMemoryDirectoryHandle({ supportsMove });
        await addInMemoryFile(root, 'hello.txt', 'hello');
        await addInMemoryFile(root, 'dir/a.txt', 'a');
        await addInMemoryFile(root, 'dir/sub/b.txt', 'b');

        const container = new Container();
        container.bind(LocalDirectoryFileSystemProviderOptions).toConstantValue({ handle: root });
        container.bind(EncodingService).toSelf().inSingletonScope();
        container.bind(LocalDirectoryFileSystemProvider).toSelf().inSingletonScope();
        provider = container.get(LocalDirectoryFileSystemProvider);
        changes = [];
        provider.onDidChangeFile(event => changes.push(...event));
    }

    beforeEach(() => setup(false));

    afterEach(() => provider.dispose());

    describe('stat', () => {
        it('reports files', async () => {
            const stat = await provider.stat(uri('/hello.txt'));
            expect(stat.type).to.equal(FileType.File);
            expect(stat.size).to.equal(5);
            expect(stat.mtime).to.be.greaterThan(0);
            expect(stat.ctime).to.equal(stat.mtime);
        });

        it('reports directories and the root', async () => {
            for (const path of ['/dir', '/']) {
                const stat = await provider.stat(uri(path));
                expect(stat).to.deep.equal({ type: FileType.Directory, mtime: 0, ctime: 0, size: 0 });
            }
        });

        it('fails for missing entries', async () => {
            await expectError(provider.stat(uri('/missing')), FileSystemProviderErrorCode.FileNotFound);
            await expectError(provider.stat(uri('/missing/child')), FileSystemProviderErrorCode.FileNotFound);
        });

        it('fails when a file is used as a directory', async () => {
            await expectError(provider.stat(uri('/hello.txt/child')), FileSystemProviderErrorCode.FileNotADirectory);
        });
    });

    describe('readdir', () => {
        it('lists entries with their types', async () => {
            const entries = await provider.readdir(uri('/dir'));
            expect(entries.sort()).to.deep.equal([['a.txt', FileType.File], ['sub', FileType.Directory]]);
        });

        it('lists the root', async () => {
            const entries = await provider.readdir(uri('/'));
            expect(entries.map(([name]) => name).sort()).to.deep.equal(['dir', 'hello.txt']);
        });

        it('fails for files and missing directories', async () => {
            await expectError(provider.readdir(uri('/hello.txt')), FileSystemProviderErrorCode.FileNotADirectory);
            await expectError(provider.readdir(uri('/nope')), FileSystemProviderErrorCode.FileNotFound);
        });
    });

    describe('mkdir', () => {
        it('creates nested directories', async () => {
            await provider.mkdir(uri('/x/y/z'));
            expect((await provider.stat(uri('/x/y/z'))).type).to.equal(FileType.Directory);
            expect(summarize()).to.deep.equal([
                ['/x', FileChangeType.ADDED], ['/x/y', FileChangeType.ADDED], ['/x/y/z', FileChangeType.ADDED]
            ]);
        });

        it('is a no-op for existing directories', async () => {
            await provider.mkdir(uri('/dir'));
            expect(changes).to.be.empty;
        });

        it('fails if a file is in the way', async () => {
            await expectError(provider.mkdir(uri('/hello.txt')), FileSystemProviderErrorCode.FileExists);
            await expectError(provider.mkdir(uri('/hello.txt/sub')), FileSystemProviderErrorCode.FileExists);
        });
    });

    describe('readFile and writeFile', () => {
        it('reads content', async () => {
            expect(decoder.decode(await provider.readFile(uri('/dir/sub/b.txt')))).to.equal('b');
        });

        it('fails to read directories and missing files', async () => {
            await expectError(provider.readFile(uri('/dir')), FileSystemProviderErrorCode.FileIsADirectory);
            await expectError(provider.readFile(uri('/')), FileSystemProviderErrorCode.FileIsADirectory);
            await expectError(provider.readFile(uri('/missing')), FileSystemProviderErrorCode.FileNotFound);
        });

        it('creates files', async () => {
            await provider.writeFile(uri('/new.txt'), encoder.encode('new'), { create: true, overwrite: false });
            expect(decoder.decode(await provider.readFile(uri('/new.txt')))).to.equal('new');
            expect(summarize()).to.deep.equal([['/new.txt', FileChangeType.ADDED]]);
        });

        it('overwrites files and truncates', async () => {
            await provider.writeFile(uri('/hello.txt'), encoder.encode('hi'), { create: false, overwrite: true });
            expect(decoder.decode(await provider.readFile(uri('/hello.txt')))).to.equal('hi');
            expect(summarize()).to.deep.equal([['/hello.txt', FileChangeType.UPDATED]]);
        });

        it('honours the create flag', async () => {
            await expectError(provider.writeFile(uri('/new.txt'), encoder.encode('x'), { create: false, overwrite: true }), FileSystemProviderErrorCode.FileNotFound);
            expect(changes).to.be.empty;
        });

        it('honours the overwrite flag', async () => {
            await expectError(provider.writeFile(uri('/hello.txt'), encoder.encode('x'), { create: true, overwrite: false }), FileSystemProviderErrorCode.FileExists);
            expect(decoder.decode(await provider.readFile(uri('/hello.txt')))).to.equal('hello');
        });

        it('fails to write to directories', async () => {
            await expectError(provider.writeFile(uri('/dir'), encoder.encode('x'), { create: true, overwrite: true }), FileSystemProviderErrorCode.FileIsADirectory);
        });

        it('fails if the parent directory is missing', async () => {
            await expectError(provider.writeFile(uri('/no/file.txt'), encoder.encode('x'), { create: true, overwrite: true }), FileSystemProviderErrorCode.FileNotFound);
        });
    });

    describe('delete', () => {
        it('deletes files', async () => {
            await provider.delete(uri('/hello.txt'), { recursive: false, useTrash: false });
            await expectError(provider.stat(uri('/hello.txt')), FileSystemProviderErrorCode.FileNotFound);
            expect(summarize()).to.deep.equal([['/hello.txt', FileChangeType.DELETED]]);
        });

        it('deletes directories recursively', async () => {
            await provider.delete(uri('/dir'), { recursive: true, useTrash: false });
            await expectError(provider.stat(uri('/dir')), FileSystemProviderErrorCode.FileNotFound);
        });

        it('refuses to delete non-empty directories without recursive', async () => {
            await expectError(provider.delete(uri('/dir'), { recursive: false, useTrash: false }), FileSystemProviderErrorCode.Unknown);
            expect((await provider.stat(uri('/dir'))).type).to.equal(FileType.Directory);
        });

        it('refuses to delete the mount root', async () => {
            await expectError(provider.delete(uri('/'), { recursive: true, useTrash: false }), FileSystemProviderErrorCode.NoPermissions);
        });

        it('fails for missing entries', async () => {
            await expectError(provider.delete(uri('/missing'), { recursive: true, useTrash: false }), FileSystemProviderErrorCode.FileNotFound);
        });
    });

    for (const supportsMove of [false, true]) {
        describe(`rename (${supportsMove ? 'with' : 'without'} move)`, () => {
            beforeEach(() => setup(supportsMove));

            it('renames files', async () => {
                await provider.rename(uri('/hello.txt'), uri('/dir/renamed.txt'), { overwrite: false });
                expect(decoder.decode(await provider.readFile(uri('/dir/renamed.txt')))).to.equal('hello');
                await expectError(provider.stat(uri('/hello.txt')), FileSystemProviderErrorCode.FileNotFound);
                expect(summarize()).to.deep.equal([
                    ['/hello.txt', FileChangeType.DELETED],
                    ['/dir/renamed.txt', FileChangeType.ADDED]
                ]);
            });

            it('renames directories with their content', async () => {
                await provider.rename(uri('/dir'), uri('/moved'), { overwrite: false });
                expect(decoder.decode(await provider.readFile(uri('/moved/sub/b.txt')))).to.equal('b');
                await expectError(provider.stat(uri('/dir')), FileSystemProviderErrorCode.FileNotFound);
            });

            it('honours overwrite', async () => {
                await expectError(provider.rename(uri('/hello.txt'), uri('/dir/a.txt'), { overwrite: false }), FileSystemProviderErrorCode.FileExists);
                await provider.rename(uri('/hello.txt'), uri('/dir/a.txt'), { overwrite: true });
                expect(decoder.decode(await provider.readFile(uri('/dir/a.txt')))).to.equal('hello');
            });

            it('refuses to move a directory into itself', async () => {
                await expectError(provider.rename(uri('/dir'), uri('/dir/sub/dir'), { overwrite: false }), FileSystemProviderErrorCode.Unknown);
            });

            it('fails for missing sources', async () => {
                await expectError(provider.rename(uri('/missing'), uri('/x'), { overwrite: false }), FileSystemProviderErrorCode.FileNotFound);
            });
        });
    }

    describe('copy', () => {
        it('copies files', async () => {
            await provider.copy(uri('/hello.txt'), uri('/copy.txt'), { overwrite: false });
            expect(decoder.decode(await provider.readFile(uri('/copy.txt')))).to.equal('hello');
            expect(decoder.decode(await provider.readFile(uri('/hello.txt')))).to.equal('hello');
            expect(summarize()).to.deep.equal([['/copy.txt', FileChangeType.ADDED]]);
        });

        it('copies directories recursively', async () => {
            await provider.copy(uri('/dir'), uri('/copy'), { overwrite: false });
            expect(decoder.decode(await provider.readFile(uri('/copy/a.txt')))).to.equal('a');
            expect(decoder.decode(await provider.readFile(uri('/copy/sub/b.txt')))).to.equal('b');
            expect((await provider.stat(uri('/dir/sub/b.txt'))).type).to.equal(FileType.File);
        });

        it('honours overwrite', async () => {
            await expectError(provider.copy(uri('/hello.txt'), uri('/dir/a.txt'), { overwrite: false }), FileSystemProviderErrorCode.FileExists);
            await provider.copy(uri('/hello.txt'), uri('/dir/a.txt'), { overwrite: true });
            expect(decoder.decode(await provider.readFile(uri('/dir/a.txt')))).to.equal('hello');
        });

        it('refuses to copy a directory into itself', async () => {
            await expectError(provider.copy(uri('/dir'), uri('/dir/sub/copy'), { overwrite: false }), FileSystemProviderErrorCode.Unknown);
        });
    });

    describe('open, write, read, close', () => {
        it('round-trips content and flushes on close', async () => {
            const fd = await provider.open(uri('/fd.txt'), { create: true });
            const content = encoder.encode('abcdef');
            expect(await provider.write(fd, 0, content, 0, content.byteLength)).to.equal(6);
            await provider.write(fd, 2, encoder.encode('XY'), 0, 2);
            await provider.close(fd);

            expect(decoder.decode(await provider.readFile(uri('/fd.txt')))).to.equal('abXYef');
            expect(changes.map(change => change.type)).to.deep.equal([FileChangeType.ADDED, FileChangeType.UPDATED]);
        });

        it('reads existing content', async () => {
            const fd = await provider.open(uri('/hello.txt'), { create: false });
            const buffer = new Uint8Array(10);
            expect(await provider.read(fd, 1, buffer, 2, 10)).to.equal(4);
            expect(decoder.decode(buffer.subarray(2, 6))).to.equal('ello');
            expect(await provider.read(fd, 5, buffer, 0, 10)).to.equal(0);
            await provider.close(fd);
            expect(changes).to.be.empty;
        });

        it('truncates when opened with create', async () => {
            const fd = await provider.open(uri('/hello.txt'), { create: true });
            await provider.close(fd);
            expect((await provider.stat(uri('/hello.txt'))).size).to.equal(0);
        });

        it('fails to open missing files without create', async () => {
            await expectError(provider.open(uri('/missing'), { create: false }), FileSystemProviderErrorCode.FileNotFound);
        });
    });

    describe('updateFile', () => {
        it('applies content changes and returns the stat', async () => {
            const result = await provider.updateFile(uri('/hello.txt'), [
                { range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } }, text: 'J' },
                { range: { start: { line: 0, character: 5 }, end: { line: 0, character: 5 } }, text: '!' }
            ], { readEncoding: 'utf8', writeEncoding: 'utf8', overwriteEncoding: false });
            expect(decoder.decode(await provider.readFile(uri('/hello.txt')))).to.equal('Jello!');
            expect(result.encoding).to.equal('utf8');
            expect(result.size).to.equal(6);
            expect(changes.map(change => change.type)).to.deep.equal([FileChangeType.UPDATED]);
        });

        it('fails for missing files', async () => {
            const options = { readEncoding: 'utf8', writeEncoding: 'utf8', overwriteEncoding: false };
            await expectError(provider.updateFile(uri('/missing'), [], options), FileSystemProviderErrorCode.FileNotFound);
        });
    });

    describe('watch', () => {
        it('returns a disposable if the FileSystemObserver is unavailable', () => {
            const disposable = provider.watch(uri('/'), { recursive: true, excludes: [] });
            expect(disposable.dispose).to.be.a('function');
            disposable.dispose();
        });
    });

    describe('error mapping', () => {
        it('maps DOM exceptions', () => {
            const map = (name: string): FileSystemProviderErrorCode =>
                (provider as unknown as { toFileSystemProviderError(error: unknown): FileSystemProviderError }).toFileSystemProviderError(new DOMException('x', name)).code;
            expect(map('NotFoundError')).to.equal(FileSystemProviderErrorCode.FileNotFound);
            expect(map('TypeMismatchError')).to.equal(FileSystemProviderErrorCode.FileNotADirectory);
            expect(map('NotAllowedError')).to.equal(FileSystemProviderErrorCode.NoPermissions);
            expect(map('SecurityError')).to.equal(FileSystemProviderErrorCode.NoPermissions);
            expect(map('QuotaExceededError')).to.equal(FileSystemProviderErrorCode.Unknown);
        });
    });
});
