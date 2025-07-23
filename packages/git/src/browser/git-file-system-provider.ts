// *****************************************************************************
// Copyright (C) 2024 1C-Soft LLC and others.
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
import { Event, URI, Disposable } from '@theia/core';
import {
    FileChange,
    FileDeleteOptions,
    FileOverwriteOptions,
    FileSystemProvider,
    FileSystemProviderCapabilities,
    FileType,
    FileWriteOptions,
    Stat,
    WatchOptions
} from '@theia/filesystem/lib/common/files';
import { GitResourceResolver } from './git-resource-resolver';
import { EncodingService } from '@theia/core/lib/common/encoding-service';

@injectable()
export class GitFileSystemProvider implements FileSystemProvider {

    readonly capabilities = FileSystemProviderCapabilities.Readonly |
        FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;

    readonly onDidChangeCapabilities: Event<void> = Event.None;
    readonly onDidChangeFile: Event<readonly FileChange[]> = Event.None;
    readonly onFileWatchError: Event<void> = Event.None;

    @inject(GitResourceResolver)
    protected readonly resourceResolver: GitResourceResolver;

    @inject(EncodingService)
    protected readonly encodingService: EncodingService;

    watch(resource: URI, opts: WatchOptions): Disposable {
        return Disposable.NULL;
    }

    async stat(resource: URI): Promise<Stat> {
        const gitResource = await this.resourceResolver.getResource(resource);
        let size = 0;
        try {
            size = await gitResource.getSize();
        } catch (e) {
            console.error(e);
        }
        return { type: FileType.File, mtime: 0, ctime: 0, size };
    }

    async readFile(resource: URI): Promise<Uint8Array> {
        const gitResource = await this.resourceResolver.getResource(resource);
        let contents = '';
        try {
            contents = await gitResource.readContents({ encoding: 'binary' });
        } catch (e) {
            console.error(e);
        }
        return this.encodingService.encode(contents, { encoding: 'binary', hasBOM: false }).buffer;
    }

    writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        throw new Error('Method not implemented.');
    }

    mkdir(resource: URI): Promise<void> {
        throw new Error('Method not implemented.');
    }

    readdir(resource: URI): Promise<[string, FileType][]> {
        throw new Error('Method not implemented.');
    }

    delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        throw new Error('Method not implemented.');
    }

    rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        throw new Error('Method not implemented.');
    }
}
