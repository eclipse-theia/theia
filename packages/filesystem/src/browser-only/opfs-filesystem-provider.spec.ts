// *****************************************************************************
// Copyright (C) 2026 CodeSignal and others.
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
import { locks } from 'worker_threads';
import { Container, injectable } from '@theia/core/shared/inversify';
import { CancellationToken, ILogger, URI } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { OPFSFacade, OPFSSync, type OPFSOptions } from 'opfs-worker';
import { FileSystemProviderErrorCode, toFileSystemProviderErrorCode } from '../common/files';
import { OPFSFileSystemProvider } from './opfs-filesystem-provider';
import { OPFSInitialization } from './opfs-filesystem-initialization';

function settle(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

class FakeFile {
    data = new Uint8Array();
    lastModified = Date.now();
    hasSyncAccessHandle = false;
}

class FakeSyncAccessHandle {
    constructor(protected readonly file: FakeFile) { }

    getSize(): number {
        return this.file.data.byteLength;
    }

    read(buffer: Uint8Array, { at = 0 }: { at?: number } = {}): number {
        const bytes = this.file.data.subarray(at, at + buffer.byteLength);
        buffer.set(bytes);
        return bytes.byteLength;
    }

    write(buffer: Uint8Array, { at = 0 }: { at?: number } = {}): number {
        if (at + buffer.byteLength > this.file.data.byteLength) {
            const grown = new Uint8Array(at + buffer.byteLength);
            grown.set(this.file.data);
            this.file.data = grown;
        }
        this.file.data.set(buffer, at);
        this.file.lastModified = Date.now();
        return buffer.byteLength;
    }

    truncate(size: number): void {
        this.file.data = this.file.data.slice(0, size);
    }

    flush(): void { }

    close(): void {
        this.file.hasSyncAccessHandle = false;
    }
}

/**
 * Like OPFS in a browser, a file can have only one sync access handle at a time.
 */
class FakeFileHandle {
    readonly kind = 'file';

    constructor(readonly name: string, protected readonly file: FakeFile) { }

    async getFile(): Promise<{ size: number, lastModified: number }> {
        return { size: this.file.data.byteLength, lastModified: this.file.lastModified };
    }

    async createSyncAccessHandle(): Promise<FakeSyncAccessHandle> {
        if (this.file.hasSyncAccessHandle) {
            throw new DOMException(`${this.name} already has a sync access handle`, 'NoModificationAllowedError');
        }
        this.file.hasSyncAccessHandle = true;
        await settle();
        return new FakeSyncAccessHandle(this.file);
    }
}

class FakeDirectoryHandle {
    readonly kind = 'directory';
    readonly entries = new Map<string, FakeFile | FakeDirectoryHandle>();

    constructor(readonly name: string) { }

    async getDirectoryHandle(name: string, { create = false } = {}): Promise<FakeDirectoryHandle> {
        let entry = this.entries.get(name);
        if (!entry && create) {
            entry = new FakeDirectoryHandle(name);
            this.entries.set(name, entry);
        }
        if (!entry) {
            throw new DOMException(name, 'NotFoundError');
        }
        if (!(entry instanceof FakeDirectoryHandle)) {
            throw new DOMException(name, 'TypeMismatchError');
        }
        return entry;
    }

    async getFileHandle(name: string, { create = false } = {}): Promise<FakeFileHandle> {
        let entry = this.entries.get(name);
        if (!entry && create) {
            entry = new FakeFile();
            this.entries.set(name, entry);
        }
        await settle();
        if (!entry) {
            throw new DOMException(name, 'NotFoundError');
        }
        if (!(entry instanceof FakeFile)) {
            throw new DOMException(name, 'TypeMismatchError');
        }
        return new FakeFileHandle(name, entry);
    }
}

class WarningsLogger extends MockLogger {
    readonly warnings: string[] = [];

    override warn(message: string): Promise<void> {
        this.warnings.push(message);
        return super.warn(message);
    }
}

@injectable()
class TestOPFSFileSystemProvider extends OPFSFileSystemProvider {
    protected override readonly fileLockTimeout = 200;

    protected override createFileSystem(options: OPFSOptions): OPFSFacade {
        // In a worker, opfs-worker receives the channel by name.
        const channel = options.broadcastChannel instanceof BroadcastChannel ? options.broadcastChannel.name : options.broadcastChannel;
        const backendOptions = { ...options, broadcastChannel: channel };
        const backend = new OPFSSync(backendOptions);
        return new OPFSFacade({ fs: backend, dispose: () => backend.dispose() }, backendOptions);
    }
}

const FILE = new URI('file:///a.txt');
const OTHER_FILE = new URI('file:///b.txt');
const MISSING_FILE = new URI('file:///missing.txt');
const OVERWRITE = { create: true, overwrite: true };
const encode = (text: string) => new TextEncoder().encode(text);
const decode = (data: Uint8Array) => new TextDecoder().decode(data);

describe('OPFSFileSystemProvider', () => {

    let provider: TestOPFSFileSystemProvider;
    let logger: WarningsLogger;
    let channel: BroadcastChannel;
    let originalNavigator: PropertyDescriptor | undefined;

    before(() => {
        originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    });

    after(() => {
        if (originalNavigator) {
            Object.defineProperty(globalThis, 'navigator', originalNavigator);
        } else {
            delete (globalThis as { navigator?: Navigator }).navigator;
        }
    });

    async function createProvider(rootDirectory: string): Promise<void> {
        const root = new FakeDirectoryHandle('');
        // opfs-worker takes Web Locks from `navigator.locks`, as in a browser.
        Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { locks, storage: { getDirectory: async () => root } } });
        channel = new BroadcastChannel(`opfs-test-${Math.random()}`);
        const initialization: OPFSInitialization = {
            getRootDirectory: () => rootDirectory,
            getBroadcastChannel: () => channel,
            initializeFS: async () => { }
        };
        const container = new Container();
        container.bind(OPFSInitialization).toConstantValue(initialization);
        container.bind(EncodingService).toSelf().inSingletonScope();
        logger = new WarningsLogger();
        container.bind(ILogger).toConstantValue(logger);
        container.bind(TestOPFSFileSystemProvider).toSelf().inSingletonScope();
        provider = container.get(TestOPFSFileSystemProvider);
        await provider.writeFile(FILE, encode('old'), OVERWRITE);
    }

    beforeEach(() => createProvider('/'));

    afterEach(() => {
        provider['fs'].dispose();
        provider.dispose();
        channel.close();
    });

    function delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function watchForChanges(resource: URI): Promise<string[]> {
        const changes: string[] = [];
        provider.onDidChangeFile(event => changes.push(...event.map(change => change.resource.path.toString())));
        provider.watch(new URI('file:///'), { recursive: true, excludes: [] });
        provider.watch(resource, { recursive: false, excludes: [] });

        await provider.writeFile(resource, encode('new'), OVERWRITE);
        await delay(50);
        return changes;
    }

    function readStream(resource: URI): Promise<string> {
        const stream = provider.readFileStream(resource, {}, CancellationToken.None);
        const chunks: Uint8Array[] = [];
        return new Promise((resolve, reject) => {
            stream.on('data', chunk => chunks.push(chunk));
            stream.on('error', reject);
            stream.on('end', () => resolve(decode(BinaryBuffer.concat(chunks.map(chunk => BinaryBuffer.wrap(chunk))).buffer)));
        });
    }

    it('should read a file while it is written', async () => {
        const [, ...contents] = await Promise.all([
            provider.writeFile(FILE, encode('new'), OVERWRITE),
            provider.readFile(FILE).then(decode),
            readStream(FILE),
            provider.readFile(FILE).then(decode)
        ]);

        expect(contents.filter(content => content !== 'old' && content !== 'new')).to.be.empty;
        expect(decode(await provider.readFile(FILE))).to.equal('new');
    });

    it('should read a file while another stream reads it', async () => {
        const contents = await Promise.all([readStream(FILE), readStream(FILE), provider.readFile(FILE).then(decode)]);

        expect(contents).to.deep.equal(['old', 'old', 'old']);
    });

    it('should hold a file from open until close', async () => {
        const fd = await provider.open(FILE, { create: false });
        let read: string | undefined;
        const reading = provider.readFile(FILE).then(data => read = decode(data));

        await provider.write(fd, 0, encode('new'), 0, 3);
        await delay(50);
        expect(read).to.be.undefined;

        await provider.close(fd);
        await reading;
        expect(read).to.equal('new');
    });

    it('should not write a file while it is open', async () => {
        const fd = await provider.open(FILE, { create: false });
        const writing = provider.writeFile(FILE, encode('new'), OVERWRITE);
        await delay(50);

        const data = new Uint8Array(3);
        const bytesRead = await provider.read(fd, 0, data, 0, 3);
        await provider.close(fd);
        await writing;

        expect(decode(data.subarray(0, bytesRead))).to.equal('old');
        expect(decode(await provider.readFile(FILE))).to.equal('new');
    });

    it('should keep a third access waiting until the second is done', async () => {
        const fd = await provider.open(FILE, { create: false });
        const second = provider.writeFile(FILE, encode('second'), OVERWRITE);
        await provider.close(fd);
        const third = provider.readFile(FILE);

        await second;
        expect(decode(await third)).to.equal('second');
    });

    it('should not make different files wait for each other', async () => {
        await provider.writeFile(OTHER_FILE, encode('other'), OVERWRITE);
        const fd = await provider.open(FILE, { create: false });

        expect(decode(await provider.readFile(OTHER_FILE))).to.equal('other');
        expect(logger.warnings).to.be.empty;
        await provider.close(fd);
    });

    it('should let the next access in after a failed open', async () => {
        const opening = provider.open(MISSING_FILE, { create: false });
        expect(toFileSystemProviderErrorCode(await opening.catch(error => error))).to.equal(FileSystemProviderErrorCode.FileNotFound);

        await provider.writeFile(MISSING_FILE, encode('created'), OVERWRITE);
        expect(logger.warnings).to.be.empty;
    });

    it('should let the next access in after a failed read', async () => {
        expect(toFileSystemProviderErrorCode(await provider.readFile(MISSING_FILE).catch(error => error))).to.equal(FileSystemProviderErrorCode.FileNotFound);

        await provider.writeFile(MISSING_FILE, encode('created'), OVERWRITE);
        expect(logger.warnings).to.be.empty;
    });

    it('should go ahead after the lock timeout when a file is never closed', async () => {
        await provider.open(FILE, { create: false });

        expect(decode(await provider.readFile(FILE))).to.equal('old');
        expect(logger.warnings).to.have.lengthOf(1);
    });

    it('should let one waiting access at a time go ahead when a file is never closed', async () => {
        await provider.open(FILE, { create: false });

        const contents = await Promise.all([provider.readFile(FILE).then(decode), readStream(FILE), provider.readFile(FILE).then(decode)]);

        expect(contents).to.deep.equal(['old', 'old', 'old']);
        expect(logger.warnings).to.have.lengthOf(1);
    });

    it('should keep reads and writes in any order apart', async () => {
        const failures: unknown[] = [];
        let previous = 'old';
        for (let i = 0; i < 30; i++) {
            const next = `v${i}`;
            const accesses = [
                () => provider.writeFile(FILE, encode(next), OVERWRITE).then(() => next),
                () => readStream(FILE),
                () => provider.readFile(FILE).then(decode),
                () => readStream(FILE)
            ];
            const rotated = [...accesses.slice(i % 4), ...accesses.slice(0, i % 4)];
            const contents = await Promise.all(rotated.map(access => access().catch(error => (failures.push(error), next))));
            failures.push(...contents.filter(content => content !== previous && content !== next));
            previous = next;
        }

        expect(failures).to.be.empty;
    });

    it('should not overwrite a file without the overwrite option', async () => {
        const writing = provider.writeFile(FILE, encode('new'), { ...OVERWRITE, overwrite: false });

        expect(toFileSystemProviderErrorCode(await writing.catch(error => error))).to.equal(FileSystemProviderErrorCode.FileExists);
        expect(decode(await provider.readFile(FILE))).to.equal('old');
    });

    it('should not create a file without the create option', async () => {
        const writing = provider.writeFile(MISSING_FILE, encode('new'), { ...OVERWRITE, create: false });

        expect(toFileSystemProviderErrorCode(await writing.catch(error => error))).to.equal(FileSystemProviderErrorCode.FileNotFound);
        expect(await provider.exists(MISSING_FILE)).to.be.false;
    });

    it('should report a change once when several watches match it', async () => {
        expect(await watchForChanges(FILE)).to.deep.equal(['/a.txt']);
    });

    it('should report changes under a root directory without a leading slash', async () => {
        provider['fs'].dispose();
        provider.dispose();
        channel.close();
        await createProvider('workspace');

        expect(await watchForChanges(FILE)).to.deep.equal(['/a.txt']);
    });
});
