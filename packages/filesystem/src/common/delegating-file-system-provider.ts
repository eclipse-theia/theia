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
import { Event, Emitter } from '@theia/core/lib/common';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import {
    FileSystemProvider, FileSystemProviderCapabilities, WatchOptions, FileDeleteOptions, FileOverwriteOptions, FileWriteOptions, FileOpenOptions, FileChange, Stat, FileType,
    hasReadWriteCapability, hasFileFolderCopyCapability, hasOpenReadWriteCloseCapability, hasAccessCapability
} from './files';

export interface DelegatingFileSystemProviderOptions {
    toResource(resource: URI): URI;
    fromResource(resource: URI): URI | undefined;
}

export class DelegatingFileSystemProvider implements Required<FileSystemProvider>, Disposable {

    private readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

    constructor(
        protected readonly delegate: FileSystemProvider,
        readonly options: DelegatingFileSystemProviderOptions,
        protected readonly toDispose = new DisposableCollection()
    ) {
        this.toDispose.push(this.onDidChangeFileEmitter);
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
        return this.delegate.watch(this.options.toResource(resource), opts);
    }

    stat(resource: URI): Promise<Stat> {
        return this.delegate.stat(this.options.toResource(resource));
    }

    access(resource: URI, mode?: number): Promise<void> {
        if (hasAccessCapability(this.delegate)) {
            return this.delegate.access(this.options.toResource(resource), mode);
        }
        throw new Error('not supported');
    }

    fsPath(resource: URI): Promise<string> {
        if (hasAccessCapability(this.delegate)) {
            return this.delegate.fsPath(this.options.toResource(resource));
        }
        throw new Error('not supported');
    }

    mkdir(resource: URI): Promise<void> {
        return this.delegate.mkdir(this.options.toResource(resource));
    }

    rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        return this.delegate.rename(this.options.toResource(from), this.options.toResource(to), opts);
    }

    copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        if (hasFileFolderCopyCapability(this.delegate)) {
            return this.delegate.copy(this.options.toResource(from), this.options.toResource(to), opts);
        }
        throw new Error('not supported');
    }

    readFile(resource: URI): Promise<Uint8Array> {
        if (hasReadWriteCapability(this.delegate)) {
            return this.delegate.readFile(this.options.toResource(resource));
        }
        throw new Error('not supported');
    }

    readdir(resource: URI): Promise<[string, FileType][]> {
        return this.delegate.readdir(this.options.toResource(resource));
    }

    writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        if (hasReadWriteCapability(this.delegate)) {
            return this.delegate.writeFile(this.options.toResource(resource), content, opts);
        }
        throw new Error('not supported');
    }

    open(resource: URI, opts: FileOpenOptions): Promise<number> {
        if (hasOpenReadWriteCloseCapability(this.delegate)) {
            return this.delegate.open(this.options.toResource(resource), opts);
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
        return this.delegate.delete(this.options.toResource(resource), opts);
    }

    protected handleFileChanges(changes: readonly FileChange[]): void {
        const delegatingChanges: FileChange[] = [];
        for (const change of changes) {
            const delegatingResource = this.options.fromResource(change.resource);
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

}
