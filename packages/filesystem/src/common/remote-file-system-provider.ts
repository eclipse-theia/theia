/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { injectable, inject, postConstruct } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { Emitter } from '@theia/core/lib/common/event';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import {
    FileWriteOptions, FileOpenOptions, FileChangeType,
    FileSystemProviderCapabilities, FileChange, Stat, FileOverwriteOptions, WatchOptions, FileType, FileSystemProvider, FileDeleteOptions,
    hasOpenReadWriteCloseCapability, hasFileFolderCopyCapability, hasReadWriteCapability, hasAccessCapability,
    FileSystemProviderError, FileSystemProviderErrorCode, FileUpdateOptions, hasUpdateCapability, FileUpdateResult, FileReadStreamOptions, hasFileReadStreamCapability
} from './files';
import { JsonRpcServer, JsonRpcProxy, JsonRpcProxyFactory } from '@theia/core/lib/common/messaging/proxy-factory';
import { ApplicationError } from '@theia/core/lib/common/application-error';
import { Deferred } from '@theia/core/lib/common/promise-util';
import type { TextDocumentContentChangeEvent } from '@theia/core/shared/vscode-languageserver-protocol';
import { newWriteableStream, ReadableStreamEvents } from '@theia/core/lib/common/stream';
import { CancellationToken, cancelled } from '@theia/core/lib/common/cancellation';

export const remoteFileSystemPath = '/services/remote-filesystem';

export const RemoteFileSystemServer = Symbol('RemoteFileSystemServer');
export interface RemoteFileSystemServer extends JsonRpcServer<RemoteFileSystemClient> {
    getCapabilities(): Promise<FileSystemProviderCapabilities>
    stat(resource: string): Promise<Stat>;
    access(resource: string, mode?: number): Promise<void>;
    fsPath(resource: string): Promise<string>;
    open(resource: string, opts: FileOpenOptions): Promise<number>;
    close(fd: number): Promise<void>;
    read(fd: number, pos: number, length: number): Promise<{ bytes: number[]; bytesRead: number; }>;
    readFileStream(resource: string, opts: FileReadStreamOptions, token: CancellationToken): Promise<number>;
    readFile(resource: string): Promise<number[]>;
    write(fd: number, pos: number, data: number[], offset: number, length: number): Promise<number>;
    writeFile(resource: string, content: number[], opts: FileWriteOptions): Promise<void>;
    delete(resource: string, opts: FileDeleteOptions): Promise<void>;
    mkdir(resource: string): Promise<void>;
    readdir(resource: string): Promise<[string, FileType][]>;
    rename(source: string, target: string, opts: FileOverwriteOptions): Promise<void>;
    copy(source: string, target: string, opts: FileOverwriteOptions): Promise<void>;
    watch(watcher: number, resource: string, opts: WatchOptions): Promise<void>;
    unwatch(watcher: number): Promise<void>;
    updateFile(resource: string, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult>;
}

export interface RemoteFileChange {
    readonly type: FileChangeType;
    readonly resource: string;
}

export interface RemoteFileStreamError extends Error {
    code?: FileSystemProviderErrorCode
}

export interface RemoteFileSystemClient {
    notifyDidChangeFile(event: { changes: RemoteFileChange[] }): void;
    notifyFileWatchError(): void;
    notifyDidChangeCapabilities(capabilities: FileSystemProviderCapabilities): void;
    onFileStreamData(handle: number, data: number[]): void;
    onFileStreamEnd(handle: number, error: RemoteFileStreamError | undefined): void;
}

export const RemoteFileSystemProviderError = ApplicationError.declare(-33005,
    (message: string, data: { code: FileSystemProviderErrorCode, name: string }, stack: string) =>
        ({ message, data, stack })
);

export class RemoteFileSystemProxyFactory<T extends object> extends JsonRpcProxyFactory<T> {

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected serializeError(e: any): any {
        if (e instanceof FileSystemProviderError) {
            const { code, name } = e;
            return super.serializeError(RemoteFileSystemProviderError(e.message, { code, name }, e.stack));
        }
        return super.serializeError(e);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected deserializeError(capturedError: Error, e: any): any {
        const error = super.deserializeError(capturedError, e);
        if (RemoteFileSystemProviderError.is(error)) {
            const fileOperationError = new FileSystemProviderError(error.message, error.data.code);
            fileOperationError.name = error.data.name;
            fileOperationError.stack = error.stack;
            return fileOperationError;
        }
        return e;
    }
}

/**
 * Frontend component.
 *
 * Wraps the remote filesystem provider living on the backend.
 */
@injectable()
export class RemoteFileSystemProvider implements Required<FileSystemProvider>, Disposable {

    private readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

    private readonly onFileWatchErrorEmitter = new Emitter<void>();
    readonly onFileWatchError = this.onFileWatchErrorEmitter.event;

    private readonly onDidChangeCapabilitiesEmitter = new Emitter<void>();
    readonly onDidChangeCapabilities = this.onDidChangeCapabilitiesEmitter.event;

    private readonly onFileStreamDataEmitter = new Emitter<[number, Uint8Array]>();
    private readonly onFileStreamData = this.onFileStreamDataEmitter.event;

    private readonly onFileStreamEndEmitter = new Emitter<[number, Error | FileSystemProviderError | undefined]>();
    private readonly onFileStreamEnd = this.onFileStreamEndEmitter.event;

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeFileEmitter,
        this.onDidChangeCapabilitiesEmitter,
        this.onFileStreamDataEmitter,
        this.onFileStreamEndEmitter
    );

    protected watcherSequence = 0;
    /**
     * We'll track the currently allocated watchers, in order to re-allocate them
     * with the same options once we reconnect to the backend after a disconnection.
     */
    protected readonly watchOptions = new Map<number, {
        uri: string;
        options: WatchOptions
    }>();

    private _capabilities: FileSystemProviderCapabilities = 0;
    get capabilities(): FileSystemProviderCapabilities { return this._capabilities; }

    protected readonly readyDeferred = new Deferred<void>();
    readonly ready = this.readyDeferred.promise;

    /**
     * Wrapped remote filesystem.
     */
    @inject(RemoteFileSystemServer)
    protected readonly server: JsonRpcProxy<RemoteFileSystemServer>;

    @postConstruct()
    protected init(): void {
        this.server.getCapabilities().then(capabilities => {
            this._capabilities = capabilities;
            this.readyDeferred.resolve();
        }, this.readyDeferred.reject);
        this.server.setClient({
            notifyDidChangeFile: ({ changes }) => {
                this.onDidChangeFileEmitter.fire(changes.map(event => ({ resource: new URI(event.resource), type: event.type })));
            },
            notifyFileWatchError: () => {
                this.onFileWatchErrorEmitter.fire();
            },
            notifyDidChangeCapabilities: capabilities => this.setCapabilities(capabilities),
            onFileStreamData: (handle, data) => this.onFileStreamDataEmitter.fire([handle, Uint8Array.from(data)]),
            onFileStreamEnd: (handle, error) => this.onFileStreamEndEmitter.fire([handle, error])
        });
        const onInitialized = this.server.onDidOpenConnection(() => {
            // skip reconnection on the first connection
            onInitialized.dispose();
            this.toDispose.push(this.server.onDidOpenConnection(() => this.reconnect()));
        });
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected setCapabilities(capabilities: FileSystemProviderCapabilities): void {
        this._capabilities = capabilities;
        this.onDidChangeCapabilitiesEmitter.fire(undefined);
    }

    // --- forwarding calls

    stat(resource: URI): Promise<Stat> {
        return this.server.stat(resource.toString());
    }

    access(resource: URI, mode?: number): Promise<void> {
        return this.server.access(resource.toString(), mode);
    }

    fsPath(resource: URI): Promise<string> {
        return this.server.fsPath(resource.toString());
    }

    open(resource: URI, opts: FileOpenOptions): Promise<number> {
        return this.server.open(resource.toString(), opts);
    }

    close(fd: number): Promise<void> {
        return this.server.close(fd);
    }

    async read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        const { bytes, bytesRead } = await this.server.read(fd, pos, length);

        // copy back the data that was written into the buffer on the remote
        // side. we need to do this because buffers are not referenced by
        // pointer, but only by value and as such cannot be directly written
        // to from the other process.
        data.set(bytes.slice(0, bytesRead), offset);

        return bytesRead;
    }

    async readFile(resource: URI): Promise<Uint8Array> {
        const bytes = await this.server.readFile(resource.toString());
        return Uint8Array.from(bytes);
    }

    readFileStream(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
        const capturedError = new Error();
        // eslint-disable-next-line @typescript-eslint/no-shadow
        const stream = newWriteableStream<Uint8Array>(data => BinaryBuffer.concat(data.map(data => BinaryBuffer.wrap(data))).buffer);
        this.server.readFileStream(resource.toString(), opts, token).then(streamHandle => {
            if (token.isCancellationRequested) {
                stream.end(cancelled());
                return;
            }
            const toDispose = new DisposableCollection(
                token.onCancellationRequested(() => stream.end(cancelled())),
                this.onFileStreamData(([handle, data]) => {
                    if (streamHandle === handle) {
                        stream.write(data);
                    }
                }),
                this.onFileStreamEnd(([handle, error]) => {
                    if (streamHandle === handle) {
                        if (error) {
                            const code = ('code' in error && error.code) || FileSystemProviderErrorCode.Unknown;
                            const fileOperationError = new FileSystemProviderError(error.message, code);
                            fileOperationError.name = error.name;
                            const capturedStack = capturedError.stack || '';
                            fileOperationError.stack = `${capturedStack}\nCaused by: ${error.stack}`;
                            stream.end(fileOperationError);
                        } else {
                            stream.end();
                        }
                    }
                })
            );
            stream.on('end', () => toDispose.dispose());
        }, error => stream.end(error));
        return stream;
    }

    write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        return this.server.write(fd, pos, [...data.values()], offset, length);
    }

    writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        return this.server.writeFile(resource.toString(), [...content.values()], opts);
    }

    delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        return this.server.delete(resource.toString(), opts);
    }

    mkdir(resource: URI): Promise<void> {
        return this.server.mkdir(resource.toString());
    }

    readdir(resource: URI): Promise<[string, FileType][]> {
        return this.server.readdir(resource.toString());
    }

    rename(resource: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
        return this.server.rename(resource.toString(), target.toString(), opts);
    }

    copy(resource: URI, target: URI, opts: FileOverwriteOptions): Promise<void> {
        return this.server.copy(resource.toString(), target.toString(), opts);
    }

    updateFile(resource: URI, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult> {
        return this.server.updateFile(resource.toString(), changes, opts);
    }

    watch(resource: URI, options: WatchOptions): Disposable {
        const watcherId = this.watcherSequence++;
        const uri = resource.toString();
        this.watchOptions.set(watcherId, { uri, options });
        this.server.watch(watcherId, uri, options);
        const toUnwatch = Disposable.create(() => {
            this.watchOptions.delete(watcherId);
            this.server.unwatch(watcherId);
        });
        this.toDispose.push(toUnwatch);
        return toUnwatch;
    }

    /**
     * When a frontend disconnects (e.g. bad connection) the backend resources will be cleared.
     *
     * This means that we need to re-allocate the watchers when a frontend reconnects.
     */
    protected reconnect(): void {
        for (const [watcher, { uri, options }] of this.watchOptions.entries()) {
            this.server.watch(watcher, uri, options);
        }
    }

}

/**
 * Backend component.
 *
 * JSON-RPC server exposing a wrapped file system provider remotely.
 */
@injectable()
export class FileSystemProviderServer implements RemoteFileSystemServer {

    private readonly BUFFER_SIZE = 64 * 1024;

    /**
     * Mapping of `watcherId` to a disposable watcher handle.
     */
    protected watchers = new Map<number, Disposable>();

    protected readonly toDispose = new DisposableCollection();
    dispose(): void {
        this.toDispose.dispose();
    }

    protected client: RemoteFileSystemClient | undefined;
    setClient(client: RemoteFileSystemClient | undefined): void {
        this.client = client;
    }

    /**
     * Wrapped file system provider.
     */
    @inject(FileSystemProvider)
    protected readonly provider: FileSystemProvider & Partial<Disposable>;

    @postConstruct()
    protected init(): void {
        if (this.provider.dispose) {
            this.toDispose.push(Disposable.create(() => this.provider.dispose!()));
        }
        this.toDispose.push(this.provider.onDidChangeCapabilities(() => {
            if (this.client) {
                this.client.notifyDidChangeCapabilities(this.provider.capabilities);
            }
        }));
        this.toDispose.push(this.provider.onDidChangeFile(changes => {
            if (this.client) {
                this.client.notifyDidChangeFile({
                    changes: changes.map(({ resource, type }) => ({ resource: resource.toString(), type }))
                });
            }
        }));
        this.toDispose.push(this.provider.onFileWatchError(() => {
            if (this.client) {
                this.client.notifyFileWatchError();
            }
        }));
    }

    async getCapabilities(): Promise<FileSystemProviderCapabilities> {
        return this.provider.capabilities;
    }

    stat(resource: string): Promise<Stat> {
        return this.provider.stat(new URI(resource));
    }

    access(resource: string, mode?: number): Promise<void> {
        if (hasAccessCapability(this.provider)) {
            return this.provider.access(new URI(resource), mode);
        }
        throw new Error('not supported');
    }

    async fsPath(resource: string): Promise<string> {
        if (hasAccessCapability(this.provider)) {
            return this.provider.fsPath(new URI(resource));
        }
        throw new Error('not supported');
    }

    open(resource: string, opts: FileOpenOptions): Promise<number> {
        if (hasOpenReadWriteCloseCapability(this.provider)) {
            return this.provider.open(new URI(resource), opts);
        }
        throw new Error('not supported');
    }

    close(fd: number): Promise<void> {
        if (hasOpenReadWriteCloseCapability(this.provider)) {
            return this.provider.close(fd);
        }
        throw new Error('not supported');
    }

    async read(fd: number, pos: number, length: number): Promise<{ bytes: number[]; bytesRead: number; }> {
        if (hasOpenReadWriteCloseCapability(this.provider)) {
            const buffer = BinaryBuffer.alloc(this.BUFFER_SIZE);
            const bytes = buffer.buffer;
            const bytesRead = await this.provider.read(fd, pos, bytes, 0, length);
            return { bytes: [...bytes.values()], bytesRead };
        }
        throw new Error('not supported');
    }

    write(fd: number, pos: number, data: number[], offset: number, length: number): Promise<number> {
        if (hasOpenReadWriteCloseCapability(this.provider)) {
            return this.provider.write(fd, pos, Uint8Array.from(data), offset, length);
        }
        throw new Error('not supported');
    }

    async readFile(resource: string): Promise<number[]> {
        if (hasReadWriteCapability(this.provider)) {
            const buffer = await this.provider.readFile(new URI(resource));
            return [...buffer.values()];
        }
        throw new Error('not supported');
    }

    writeFile(resource: string, content: number[], opts: FileWriteOptions): Promise<void> {
        if (hasReadWriteCapability(this.provider)) {
            return this.provider.writeFile(new URI(resource), Uint8Array.from(content), opts);
        }
        throw new Error('not supported');
    }

    delete(resource: string, opts: FileDeleteOptions): Promise<void> {
        return this.provider.delete(new URI(resource), opts);
    }

    mkdir(resource: string): Promise<void> {
        return this.provider.mkdir(new URI(resource));
    }

    readdir(resource: string): Promise<[string, FileType][]> {
        return this.provider.readdir(new URI(resource));
    }

    rename(source: string, target: string, opts: FileOverwriteOptions): Promise<void> {
        return this.provider.rename(new URI(source), new URI(target), opts);
    }

    copy(source: string, target: string, opts: FileOverwriteOptions): Promise<void> {
        if (hasFileFolderCopyCapability(this.provider)) {
            return this.provider.copy(new URI(source), new URI(target), opts);
        }
        throw new Error('not supported');
    }

    updateFile(resource: string, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult> {
        if (hasUpdateCapability(this.provider)) {
            return this.provider.updateFile(new URI(resource), changes, opts);
        }
        throw new Error('not supported');
    }

    async watch(requestedWatcherId: number, resource: string, opts: WatchOptions): Promise<void> {
        if (this.watchers.has(requestedWatcherId)) {
            throw new Error('watcher id is already allocated!');
        }
        const watcher = this.provider.watch(new URI(resource), opts);
        this.watchers.set(requestedWatcherId, watcher);
        this.toDispose.push(Disposable.create(() => this.unwatch(requestedWatcherId)));
    }

    async unwatch(watcherId: number): Promise<void> {
        const watcher = this.watchers.get(watcherId);
        if (watcher) {
            this.watchers.delete(watcherId);
            watcher.dispose();
        }
    }

    protected readFileStreamSeq = 0;

    async readFileStream(resource: string, opts: FileReadStreamOptions, token: CancellationToken): Promise<number> {
        if (hasFileReadStreamCapability(this.provider)) {
            const handle = this.readFileStreamSeq++;
            const stream = this.provider.readFileStream(new URI(resource), opts, token);
            stream.on('data', data => this.client?.onFileStreamData(handle, [...data.values()]));
            stream.on('error', error => {
                const code = error instanceof FileSystemProviderError ? error.code : undefined;
                const { name, message, stack } = error;
                // eslint-disable-next-line no-unused-expressions
                this.client?.onFileStreamEnd(handle, { code, name, message, stack });
            });
            stream.on('end', () => this.client?.onFileStreamEnd(handle, undefined));
            return handle;
        }
        throw new Error('not supported');
    }

}
