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

import { CancellationTokenSource } from '@theia/core/lib/common/cancellation';
import { EncodingService } from '@theia/core/lib/common/encoding-service';
import { FileUri } from '@theia/core/lib/common/file-uri';
import { ILogger } from '@theia/core/lib/common/logger';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { IPCConnectionProvider } from '@theia/core/lib/node/messaging/ipc-connection-provider';
import { Container, ContainerModule, injectable } from '@theia/core/shared/inversify';
import { expect } from 'chai';
import { promises as fs } from 'fs';
import { join } from 'path';
import * as temp from 'temp';
import { FileSystemProvider } from '../common/files.js';
import { FileSystemProviderServer, RemoteFileStreamError, RemoteFileSystemClient } from '../common/remote-file-system-provider.js';
import { DiskFileSystemProvider } from './disk-file-system-provider.js';
import { bindFileSystemWatcherServer } from './filesystem-backend-module.js';

const tracked = temp.track();

const WINDOW_SIZE = 256 * 1024;
const FILE_SIZE = 4 * 1024 * 1024;

@injectable()
class CountingDiskFileSystemProvider extends DiskFileSystemProvider {
    bytesRead = 0;
    openHandles = 0;

    override async open(...args: Parameters<DiskFileSystemProvider['open']>): Promise<number> {
        const handle = await super.open(...args);
        this.openHandles++;
        return handle;
    }

    override async close(fd: number): Promise<void> {
        this.openHandles--;
        return super.close(fd);
    }

    override async read(...args: Parameters<DiskFileSystemProvider['read']>): Promise<number> {
        const bytesRead = await super.read(...args);
        this.bytesRead += bytesRead;
        return bytesRead;
    }
}

@injectable()
class TestFileSystemProviderServer extends FileSystemProviderServer {
    protected override readonly fileStreamWindowSize = WINDOW_SIZE;
}

class TestClient implements RemoteFileSystemClient {
    received = 0;
    acknowledged = 0;
    autoAcknowledge = false;
    readonly ended = new Deferred<RemoteFileStreamError | undefined>();

    constructor(protected readonly server: FileSystemProviderServer) { }

    acknowledge(): void {
        // Acknowledging can deliver more data synchronously, so count what is acknowledged before sending it.
        const byteLength = this.received - this.acknowledged;
        this.acknowledged = this.received;
        this.server.notifyFileStreamDataReceived(0, byteLength);
    }

    onFileStreamData(handle: number, data: Uint8Array): void {
        this.received += data.byteLength;
        if (this.autoAcknowledge) {
            this.acknowledge();
        }
    }
    onFileStreamEnd(handle: number, error: RemoteFileStreamError | undefined): void {
        this.ended.resolve(error);
    }
    notifyDidChangeFile(): void { }
    notifyFileWatchError(): void { }
    notifyDidChangeCapabilities(): void { }
    notifyDidChangeReadOnlyMessage(): void { }
}

describe('FileSystemProviderServer', () => {
    let provider: CountingDiskFileSystemProvider;
    let server: TestFileSystemProviderServer;
    let client: TestClient;
    let file: string;

    before(async () => {
        file = join(tracked.mkdirSync(), 'large.bin');
        await fs.writeFile(file, Buffer.alloc(FILE_SIZE, 1));
    });

    after(() => tracked.cleanupSync());

    beforeEach(() => {
        const container = new Container();
        container.load(new ContainerModule(bind => {
            bind(CountingDiskFileSystemProvider).toSelf().inSingletonScope();
            bind(FileSystemProvider).toService(CountingDiskFileSystemProvider);
            bind(TestFileSystemProviderServer).toSelf();
            bind(EncodingService).toSelf().inSingletonScope();
            bindFileSystemWatcherServer(bind);
            bind(MockLogger).toSelf().inSingletonScope();
            bind(ILogger).toService(MockLogger);
            bind(IPCConnectionProvider).toSelf().inSingletonScope();
        }));
        provider = container.get(CountingDiskFileSystemProvider);
        server = container.get(TestFileSystemProviderServer);
        client = new TestClient(server);
        server.setClient(client);
    });

    afterEach(() => server.dispose());

    describe('readFileStream', () => {
        it('sends the whole file to a client that acknowledges the data', async () => {
            client.autoAcknowledge = true;

            await server.readFileStream(FileUri.create(file).toString(), 0, {}, new CancellationTokenSource().token);

            expect(await client.ended.promise).to.be.undefined;
            expect(client.received).to.equal(FILE_SIZE);
            expect(provider.openHandles).to.equal(0);
        });

        it('stops reading while the client has not acknowledged the data', async () => {
            let done = false;

            const reading = server.readFileStream(FileUri.create(file).toString(), 0, {}, new CancellationTokenSource().token).then(() => done = true);
            await waitUntilIdle(provider);

            expect(done).to.be.false;
            expect(client.received).to.be.at.least(WINDOW_SIZE).and.below(FILE_SIZE);
            expect(provider.bytesRead).to.be.below(FILE_SIZE);

            client.acknowledge();
            await waitUntilIdle(provider);
            expect(done).to.be.false;
            expect(client.received).to.be.at.least(2 * WINDOW_SIZE).and.below(FILE_SIZE);

            client.autoAcknowledge = true;
            client.acknowledge();
            await reading;
            expect(client.received).to.equal(FILE_SIZE);
            expect(provider.openHandles).to.equal(0);
        });

        it('stops reading and releases the file when cancelled', async () => {
            const cancellation = new CancellationTokenSource();

            const reading = server.readFileStream(FileUri.create(file).toString(), 0, {}, cancellation.token);
            await waitUntilIdle(provider);
            const received = client.received;

            cancellation.cancel();
            await reading;

            expect(await client.ended.promise).to.not.be.undefined;
            expect(client.received).to.equal(received);
            expect(provider.bytesRead).to.be.below(FILE_SIZE);
            expect(provider.openHandles).to.equal(0);
        });
    });
});

/**
 * Resolves once the provider has stopped reading from disk.
 */
async function waitUntilIdle(provider: CountingDiskFileSystemProvider): Promise<void> {
    let bytesRead: number;
    do {
        bytesRead = provider.bytesRead;
        await new Promise(resolve => setTimeout(resolve, 50));
    } while (provider.bytesRead !== bytesRead);
}
