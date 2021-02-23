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

import URI from '@theia/core/lib/common/uri';
import { Event, Emitter, CancellationToken } from '@theia/core/lib/common';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import {
    FileSystemProvider, FileSystemProviderCapabilities, WatchOptions, FileDeleteOptions, FileOverwriteOptions, FileWriteOptions, FileOpenOptions, FileChange, Stat, FileType,
    hasReadWriteCapability, hasFileFolderCopyCapability, hasOpenReadWriteCloseCapability, hasAccessCapability, FileUpdateOptions, hasUpdateCapability, FileUpdateResult,
    FileReadStreamOptions,
    hasFileReadStreamCapability
} from './files';
import type { TextDocumentContentChangeEvent } from '@theia/core/shared/vscode-languageserver-protocol';
import { ReadableStreamEvents } from '@theia/core/lib/common/stream';

export class DelegatingFileSystemProvider implements Required<FileSystemProvider>, Disposable {

    private readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

    private readonly onFileWatchErrorEmitter = new Emitter<void>();
    readonly onFileWatchError = this.onFileWatchErrorEmitter.event;

    constructor(
        protected readonly delegate: FileSystemProvider,
        protected readonly options: DelegatingFileSystemProvider.Options,
        protected readonly toDispose = new DisposableCollection()
    ) {
        this.toDispose.push(this.onDidChangeFileEmitter);
        this.toDispose.push(delegate.onDidChangeFile(changes => this.handleFileChanges(changes)));
        this.toDispose.push(this.onFileWatchErrorEmitter);
        this.toDispose.push(delegate.onFileWatchError(changes => this.onFileWatchErrorEmitter.fire()));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get capabilities(): FileSystemProviderCapabilities {
        return this.delegate.capabilities;
    }

    get onDidChangeCapabilities(): Event<void> {
        return this.delegate.onDidChangeCapabilities;
    }

    watch(resource: URI, opts: WatchOptions): Disposable {
        return this.delegate.watch(this.toUnderlyingResource(resource), opts);
    }

    stat(resource: URI): Promise<Stat> {
        return this.delegate.stat(this.toUnderlyingResource(resource));
    }

    access(resource: URI, mode?: number): Promise<void> {
        if (hasAccessCapability(this.delegate)) {
            return this.delegate.access(this.toUnderlyingResource(resource), mode);
        }
        throw new Error('not supported');
    }

    fsPath(resource: URI): Promise<string> {
        if (hasAccessCapability(this.delegate)) {
            return this.delegate.fsPath(this.toUnderlyingResource(resource));
        }
        throw new Error('not supported');
    }

    mkdir(resource: URI): Promise<void> {
        return this.delegate.mkdir(this.toUnderlyingResource(resource));
    }

    rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        return this.delegate.rename(this.toUnderlyingResource(from), this.toUnderlyingResource(to), opts);
    }

    copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        if (hasFileFolderCopyCapability(this.delegate)) {
            return this.delegate.copy(this.toUnderlyingResource(from), this.toUnderlyingResource(to), opts);
        }
        throw new Error('not supported');
    }

    readFile(resource: URI): Promise<Uint8Array> {
        if (hasReadWriteCapability(this.delegate)) {
            return this.delegate.readFile(this.toUnderlyingResource(resource));
        }
        throw new Error('not supported');
    }

    readFileStream(resource: URI, opts: FileReadStreamOptions, token: CancellationToken): ReadableStreamEvents<Uint8Array> {
        if (hasFileReadStreamCapability(this.delegate)) {
            return this.delegate.readFileStream(this.toUnderlyingResource(resource), opts, token);
        }
        throw new Error('not supported');
    }

    readdir(resource: URI): Promise<[string, FileType][]> {
        return this.delegate.readdir(this.toUnderlyingResource(resource));
    }

    writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        if (hasReadWriteCapability(this.delegate)) {
            return this.delegate.writeFile(this.toUnderlyingResource(resource), content, opts);
        }
        throw new Error('not supported');
    }

    open(resource: URI, opts: FileOpenOptions): Promise<number> {
        if (hasOpenReadWriteCloseCapability(this.delegate)) {
            return this.delegate.open(this.toUnderlyingResource(resource), opts);
        }
        throw new Error('not supported');
    }

    close(fd: number): Promise<void> {
        if (hasOpenReadWriteCloseCapability(this.delegate)) {
            return this.delegate.close(fd);
        }
        throw new Error('not supported');
    }

    read(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        if (hasOpenReadWriteCloseCapability(this.delegate)) {
            return this.delegate.read(fd, pos, data, offset, length);
        }
        throw new Error('not supported');
    }

    write(fd: number, pos: number, data: Uint8Array, offset: number, length: number): Promise<number> {
        if (hasOpenReadWriteCloseCapability(this.delegate)) {
            return this.delegate.write(fd, pos, data, offset, length);
        }
        throw new Error('not supported');
    }

    delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        return this.delegate.delete(this.toUnderlyingResource(resource), opts);
    }

    updateFile(resource: URI, changes: TextDocumentContentChangeEvent[], opts: FileUpdateOptions): Promise<FileUpdateResult> {
        if (hasUpdateCapability(this.delegate)) {
            return this.delegate.updateFile(resource, changes, opts);
        }
        throw new Error('not supported');
    }

    protected handleFileChanges(changes: readonly FileChange[]): void {
        const delegatingChanges: FileChange[] = [];
        for (const change of changes) {
            const delegatingResource = this.fromUnderlyingResource(change.resource);
            if (delegatingResource) {
                delegatingChanges.push({
                    resource: delegatingResource,
                    type: change.type
                });
            }
        }
        if (delegatingChanges.length) {
            this.onDidChangeFileEmitter.fire(delegatingChanges);
        }
    }

    /**
     * Converts to an underlying fs provider resource format.
     *
     * For example converting `user-storage` resources to `file` resources under a user home:
     * user-storage:/user/settings.json => file://home/.theia/settings.json
     */
    toUnderlyingResource(resource: URI): URI {
        const underlying = this.options.uriConverter.to(resource);
        if (!underlying) {
            throw new Error('invalid resource: ' + resource.toString());
        }
        return underlying;
    }

    /**
     * Converts from an underlying fs provider resource format.
     *
     * For example converting `file` resources under a user home to `user-storage` resource:
     * - file://home/.theia/settings.json => user-storage:/user/settings.json
     * - file://documents/some-document.txt => undefined
     */
    fromUnderlyingResource(resource: URI): URI | undefined {
        return this.options.uriConverter.from(resource);
    }

}
export namespace DelegatingFileSystemProvider {
    export interface Options {
        uriConverter: URIConverter
    }
    export interface URIConverter {
        /**
         * Converts to an underlying fs provider resource format.
         * Returns undefined if the given resource is not valid resource.
         *
         * For example converting `user-storage` resources to `file` resources under a user home:
         * user-storage:/user/settings.json => file://home/.theia/settings.json
         * user-storage:/settings.json => undefined
         */
        to(resource: URI): URI | undefined;
        /**
         * Converts from an underlying fs provider resource format.
         *
         * For example converting `file` resources under a user home to `user-storage` resource:
         * - file://home/.theia/settings.json => user-storage:/settings.json
         * - file://documents/some-document.txt => undefined
         */
        from(resource: URI): URI | undefined;
    }
}
