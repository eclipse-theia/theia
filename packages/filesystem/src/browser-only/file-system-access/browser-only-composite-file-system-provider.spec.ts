// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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
import { Emitter, Event, URI } from '@theia/core';
import { FileChange, FileChangeType, FileSystemProviderErrorCode, FileType, Stat } from '../../common/files';
import { OPFSFileSystemProvider } from '../opfs-filesystem-provider';
import { BrowserOnlyCompositeFileSystemProvider } from './browser-only-composite-file-system-provider';
import { LocalDirectoryMount, LocalDirectoryMountService } from './local-directory-mount-service';
import { FileSystemAccessPermissionState } from './file-system-access-types';

const enc = new TextEncoder();
const dec = new TextDecoder();

/** Keeps entries in maps by path and implements just the parts of the OPFS provider that the composite uses. */
class FakeProvider {
    readonly files = new Map<string, Uint8Array>();
    readonly dirs = new Set<string>(['/']);
    readonly emitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.emitter.event;
    readonly opened = new Map<number, string>();
    readonly calls: string[] = [];
    nextFd = 1;

    protected p(uri: URI): string {
        return uri.path.toString().replace(/(.)\/+$/, '$1');
    }
    async stat(uri: URI): Promise<Stat> {
        const path = this.p(uri);
        if (this.dirs.has(path)) {
            return { type: FileType.Directory, ctime: 1, mtime: 1, size: 0 };
        }
        const file = this.files.get(path);
        if (file) {
            return { type: FileType.File, ctime: 1, mtime: 1, size: file.length };
        }
        throw new Error('not found ' + path);
    }
    async mkdir(uri: URI): Promise<void> {
        this.calls.push('mkdir ' + this.p(uri));
        this.dirs.add(this.p(uri));
    }
    async readdir(uri: URI): Promise<[string, FileType][]> {
        const prefix = this.p(uri) === '/' ? '/' : this.p(uri) + '/';
        const result: [string, FileType][] = [];
        for (const dir of this.dirs) {
            if (dir !== '/' && dir.startsWith(prefix) && !dir.substring(prefix.length).includes('/')) {
                result.push([dir.substring(prefix.length), FileType.Directory]);
            }
        }
        for (const file of this.files.keys()) {
            if (file.startsWith(prefix) && !file.substring(prefix.length).includes('/')) {
                result.push([file.substring(prefix.length), FileType.File]);
            }
        }
        return result;
    }
    async delete(uri: URI): Promise<void> {
        const path = this.p(uri);
        this.calls.push('delete ' + path);
        for (const key of Array.from(this.files.keys())) {
            if (key === path || key.startsWith(path + '/')) {
                this.files.delete(key);
            }
        }
        for (const dir of Array.from(this.dirs)) {
            if (dir === path || dir.startsWith(path + '/')) {
                this.dirs.delete(dir);
            }
        }
    }
    async rename(from: URI, to: URI): Promise<void> {
        this.calls.push(`rename ${this.p(from)} ${this.p(to)}`);
    }
    async copy(from: URI, to: URI): Promise<void> {
        this.calls.push(`copy ${this.p(from)} ${this.p(to)}`);
    }
    async readFile(uri: URI): Promise<Uint8Array> {
        const file = this.files.get(this.p(uri));
        if (!file) {
            throw new Error('not found');
        }
        return file;
    }
    async writeFile(uri: URI, content: Uint8Array): Promise<void> {
        this.files.set(this.p(uri), content);
    }
    async open(uri: URI): Promise<number> {
        const fd = this.nextFd++;
        this.opened.set(fd, this.p(uri));
        return fd;
    }
    async close(fd: number): Promise<void> {
        this.opened.delete(fd);
    }
    async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        const content = this.files.get(this.opened.get(fd)!)!;
        const slice = content.subarray(pos, pos + length);
        data.set(slice, offset);
        return slice.length;
    }
    async write(fd: number): Promise<number> {
        return fd;
    }
    readonly watched: string[] = [];
    watch(resource: URI): { dispose(): void } {
        const path = resource.path.toString();
        this.watched.push(path);
        return { dispose: () => this.watched.splice(this.watched.indexOf(path), 1) };
    }
}

class FakeMountService {
    readonly emitter = new Emitter<void>();
    readonly onDidChangeMounts: Event<void> = this.emitter.event;
    readonly ready = Promise.resolve();
    readonly mounts = new Map<string, LocalDirectoryMount>();

    add(name: string, permission: FileSystemAccessPermissionState = 'granted'): FakeProvider {
        const provider = new FakeProvider();
        this.mounts.set(name, { name, permission, provider: provider as never, handle: undefined as never, uri: LocalDirectoryMount.toUri(name) });
        this.emitter.fire();
        return provider;
    }
    remove(name: string): void {
        this.mounts.delete(name);
        this.emitter.fire();
    }
    getMount(name: string): LocalDirectoryMount | undefined {
        return this.mounts.get(name);
    }
    getMounts(): LocalDirectoryMount[] {
        return Array.from(this.mounts.values());
    }
}

describe('BrowserOnlyCompositeFileSystemProvider', () => {
    let opfs: FakeProvider;
    let mounts: FakeMountService;
    let composite: BrowserOnlyCompositeFileSystemProvider;
    let events: FileChange[];

    const file = (path: string): URI => new URI('file://' + path);
    // Mount watchers are registered asynchronously once the mount is resolved.
    const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve));
    const expectCode = async (promise: Promise<unknown>, code: FileSystemProviderErrorCode): Promise<void> => {
        try {
            await promise;
        } catch (error) {
            expect((error as Error).name).to.contain(code);
            return;
        }
        throw new Error('expected an error');
    };

    beforeEach(() => {
        opfs = new FakeProvider();
        mounts = new FakeMountService();
        composite = new BrowserOnlyCompositeFileSystemProvider();
        Object.assign(composite, { opfs: opfs as unknown as OPFSFileSystemProvider, mountService: mounts as unknown as LocalDirectoryMountService });
        (composite as unknown as { init(): void }).init();
        events = [];
        composite.onDidChangeFile(changes => events.push(...changes));
    });

    it('routes paths outside /local to the OPFS', async () => {
        opfs.files.set('/a.txt', enc.encode('opfs'));
        expect(dec.decode(await composite.readFile(file('/a.txt')))).to.equal('opfs');
        await composite.writeFile(file('/b.txt'), enc.encode('b'), { create: true, overwrite: true });
        expect(opfs.files.has('/b.txt')).to.be.true;
    });

    it('routes /local/<name>/... to the mount with mount-relative URIs', async () => {
        const provider = mounts.add('proj');
        provider.dirs.add('/src');
        await composite.writeFile(file('/local/proj/src/x.ts'), enc.encode('x'), { create: true, overwrite: true });
        expect(Array.from(provider.files.keys())).to.deep.equal(['/src/x.ts']);
        expect(opfs.files.size).to.equal(0);
        expect((await composite.stat(file('/local/proj'))).type).to.equal(FileType.Directory);
        expect(provider.files.has('/src/x.ts')).to.be.true;
    });

    it('fails with FileNotFound for unknown mounts', async () => {
        mounts.add('proj');
        await expectCode(composite.stat(file('/local/other/a')), FileSystemProviderErrorCode.FileNotFound);
    });

    it('lists mounts at /local and hides /local without mounts', async () => {
        await expectCode(composite.stat(file('/local')), FileSystemProviderErrorCode.FileNotFound);
        mounts.add('one');
        mounts.add('two');
        expect((await composite.stat(file('/local'))).type).to.equal(FileType.Directory);
        expect(await composite.readdir(file('/local'))).to.deep.equal([['one', FileType.Directory], ['two', FileType.Directory]]);
    });

    it('merges local into the root listing only when there are mounts', async () => {
        opfs.dirs.add('/ws');
        expect(await composite.readdir(file('/'))).to.deep.equal([['ws', FileType.Directory]]);
        mounts.add('one');
        expect(await composite.readdir(file('/'))).to.deep.equal([['ws', FileType.Directory], ['local', FileType.Directory]]);
    });

    it('does not allow modifying the virtual folder or mount roots', async () => {
        mounts.add('one');
        await composite.mkdir(file('/local'));
        await expectCode(composite.delete(file('/local'), { recursive: true, useTrash: false }), FileSystemProviderErrorCode.NoPermissions);
        await expectCode(composite.rename(file('/local'), file('/x'), { overwrite: false }), FileSystemProviderErrorCode.NoPermissions);
        await expectCode(composite.delete(file('/local/one'), { recursive: true, useTrash: false }), FileSystemProviderErrorCode.NoPermissions);
    });

    it('rewrites mount events to absolute URIs', () => {
        const provider = mounts.add('one');
        events.length = 0;
        provider.emitter.fire([{ resource: new URI('file:///src/a.ts'), type: FileChangeType.UPDATED }, { resource: new URI('file:///'), type: FileChangeType.UPDATED }]);
        expect(events.map(e => e.resource.toString())).to.deep.equal(['file:///local/one/src/a.ts', 'file:///local/one']);
    });

    it('forwards OPFS events unchanged', () => {
        opfs.emitter.fire([{ resource: new URI('file:///a'), type: FileChangeType.ADDED }]);
        expect(events.map(e => e.resource.toString())).to.deep.equal(['file:///a']);
    });

    it('fires events when mounts appear and disappear', () => {
        mounts.add('one');
        expect(events.map(e => [e.resource.toString(), e.type])).to.deep.equal([
            ['file:///local', FileChangeType.ADDED],
            ['file:///local/one', FileChangeType.ADDED]
        ]);
        events.length = 0;
        mounts.add('two');
        expect(events.map(e => e.resource.toString())).to.deep.equal(['file:///local/two']);
        events.length = 0;
        mounts.remove('two');
        mounts.remove('one');
        expect(events.map(e => [e.resource.toString(), e.type])).to.deep.equal([
            ['file:///local/two', FileChangeType.DELETED],
            ['file:///local/one', FileChangeType.DELETED],
            ['file:///local', FileChangeType.DELETED]
        ]);
    });

    it('stops forwarding events of unmounted providers', () => {
        const provider = mounts.add('one');
        mounts.remove('one');
        events.length = 0;
        provider.emitter.fire([{ resource: new URI('file:///a'), type: FileChangeType.UPDATED }]);
        expect(events).to.be.empty;
    });

    it('reports UPDATED for the mount root when permission is granted', () => {
        mounts.add('one', 'prompt');
        events.length = 0;
        mounts.getMount('one')!.permission = 'granted';
        mounts.emitter.fire();
        expect(events.map(e => [e.resource.toString(), e.type])).to.deep.equal([['file:///local/one', FileChangeType.UPDATED]]);
    });

    it('delegates same-provider rename and copy with relative URIs', async () => {
        const provider = mounts.add('one');
        await composite.rename(file('/local/one/a'), file('/local/one/b'), { overwrite: false });
        await composite.copy(file('/local/one/a'), file('/local/one/c'), { overwrite: false });
        expect(provider.calls).to.deep.equal(['rename /a /b', 'copy /a /c']);
    });

    it('copies files and folders from OPFS into a mount', async () => {
        const provider = mounts.add('one');
        opfs.dirs.add('/d');
        opfs.dirs.add('/d/sub');
        opfs.files.set('/d/a.txt', enc.encode('a'));
        opfs.files.set('/d/sub/b.txt', enc.encode('b'));
        await composite.copy(file('/d'), file('/local/one/copy'), { overwrite: false });
        expect(dec.decode(provider.files.get('/copy/a.txt'))).to.equal('a');
        expect(dec.decode(provider.files.get('/copy/sub/b.txt'))).to.equal('b');
        expect(opfs.files.size).to.equal(2);
    });

    it('refuses to overwrite across providers unless asked to', async () => {
        const provider = mounts.add('one');
        opfs.files.set('/a.txt', enc.encode('new'));
        provider.files.set('/a.txt', enc.encode('old'));
        await expectCode(composite.copy(file('/a.txt'), file('/local/one/a.txt'), { overwrite: false }), FileSystemProviderErrorCode.FileExists);
        await composite.copy(file('/a.txt'), file('/local/one/a.txt'), { overwrite: true });
        expect(dec.decode(provider.files.get('/a.txt'))).to.equal('new');
    });

    it('deletes the source when renaming across providers', async () => {
        const one = mounts.add('one');
        const two = mounts.add('two');
        one.files.set('/a.txt', enc.encode('a'));
        await composite.rename(file('/local/one/a.txt'), file('/local/two/a.txt'), { overwrite: false });
        expect(one.files.has('/a.txt')).to.be.false;
        expect(dec.decode(two.files.get('/a.txt'))).to.equal('a');
    });

    it('maps file descriptors of different providers without collisions', async () => {
        const provider = mounts.add('one');
        opfs.files.set('/o.txt', enc.encode('opfs'));
        provider.files.set('/m.txt', enc.encode('mount'));
        const fd1 = await composite.open(file('/o.txt'), { create: false });
        const fd2 = await composite.open(file('/local/one/m.txt'), { create: false });
        expect(fd1).to.not.equal(fd2);
        const buffer = new Uint8Array(5);
        await composite.read(fd2, 0, buffer, 0, 5);
        expect(dec.decode(buffer)).to.equal('mount');
        await composite.close(fd1);
        await composite.close(fd2);
        expect(opfs.opened.size).to.equal(0);
        expect(provider.opened.size).to.equal(0);
        await expectCode(composite.close(fd1), FileSystemProviderErrorCode.Unknown);
    });

    it('watches mounts with mount-relative URIs until disposed', async () => {
        const provider = mounts.add('one');
        const watcher = composite.watch(file('/local/one/src'), { recursive: true, excludes: [] });
        await flush();
        expect(provider.watched).to.deep.equal(['/src']);
        watcher.dispose();
        expect(provider.watched).to.deep.equal([]);
    });

    it('does not watch mounts if the watcher is disposed before the mount is resolved', async () => {
        const provider = mounts.add('one');
        composite.watch(file('/local/one'), { recursive: true, excludes: [] }).dispose();
        await flush();
        expect(provider.watched).to.deep.equal([]);
    });

    describe('without permission', () => {
        it('exposes the mount root as directory only', async () => {
            const provider = mounts.add('one', 'prompt');
            expect((await composite.stat(file('/local/one'))).type).to.equal(FileType.Directory);
            await expectCode(composite.stat(file('/local/one/a')), FileSystemProviderErrorCode.NoPermissions);
            expect(await composite.readdir(file('/local/one'))).to.deep.equal([]);
            await expectCode(composite.readdir(file('/local/one/sub')), FileSystemProviderErrorCode.NoPermissions);
            await expectCode(composite.readFile(file('/local/one/a')), FileSystemProviderErrorCode.NoPermissions);
            await expectCode(composite.writeFile(file('/local/one/a'), new Uint8Array(), { create: true, overwrite: true }), FileSystemProviderErrorCode.NoPermissions);
            expect(provider.files.size).to.equal(0);
        });

        it('does not watch', async () => {
            const provider = mounts.add('one', 'prompt');
            composite.watch(file('/local/one'), { recursive: true, excludes: [] });
            await flush();
            expect(provider.watched).to.deep.equal([]);
        });
    });
});
