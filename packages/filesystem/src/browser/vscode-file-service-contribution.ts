// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { FileServiceContribution, FileService } from './file-service';
import {
    FileChange, FileDeleteOptions, FileOverwriteOptions, FilePermission, FileSystemProvider, FileSystemProviderCapabilities, FileType, FileWriteOptions, Stat, WatchOptions
} from '../common/files';
import { Event, URI, Disposable, Emitter } from '@theia/core';
import { JsonSchemaDataStore } from '@theia/core/lib/browser/json-schema-store';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';

@injectable()
export class VSCodeFileSystemProvider implements FileSystemProvider {
    readonly capabilities = FileSystemProviderCapabilities.Readonly + FileSystemProviderCapabilities.FileReadWrite;
    readonly onDidChangeCapabilities = Event.None;
    protected readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;
    readonly onFileWatchError = Event.None;

    @inject(JsonSchemaDataStore)
    protected readonly store: JsonSchemaDataStore;

    watch(resource: URI, opts: WatchOptions): Disposable {
        return Disposable.NULL;
    }
    async stat(resource: URI): Promise<Stat> {
        if (this.store.hasSchema(resource)) {
            const currentTime = Date.now();
            return {
                type: FileType.File,
                permissions: FilePermission.Readonly,
                mtime: currentTime,
                ctime: currentTime,
                size: 0
            };
        }
        throw new Error('Not Found!');
    }
    mkdir(resource: URI): Promise<void> {
        return Promise.resolve();
    }
    readdir(resource: URI): Promise<[string, FileType][]> {
        return Promise.resolve([]);
    }
    delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        return Promise.resolve();
    }
    rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        return Promise.resolve();
    }
    async readFile(resource: URI): Promise<Uint8Array> {
        if (resource.scheme !== 'vscode') {
            throw new Error('Not Supported!');
        }
        let content: string | undefined;
        if (resource.authority === 'schemas') {
            content = this.store.getSchema(resource);
        }
        if (typeof content === 'string') {
            return BinaryBuffer.fromString(content).buffer;
        }
        throw new Error('Not Found!');
    }
    writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        throw new Error('Not Supported!');
    }
}

@injectable()
export class VSCodeFileServiceContribution implements FileServiceContribution {

    @inject(VSCodeFileSystemProvider)
    protected readonly provider: VSCodeFileSystemProvider;

    registerFileSystemProviders(service: FileService): void {
        service.registerProvider('vscode', this.provider);
    }

}
