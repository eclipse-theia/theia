// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin and others.
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
import { Disposable, Event, URI } from '@theia/core';
import {
    createFileSystemProviderError, FileChange, FileDeleteOptions, FileOverwriteOptions, FileSystemProvider, FileSystemProviderCapabilities,
    FileSystemProviderErrorCode, FileType, FileWriteOptions, Stat
} from '@theia/filesystem/lib/common/files';
import { FileService, FileServiceContribution } from '@theia/filesystem/lib/browser/file-service';
import { Schemes } from '../../common/uri-components.js';

/**
 * Reads `http` and `https` resources with `fetch`, like the `FetchFileSystemProvider` of VS Code for the web.
 *
 * Frontend plugins get an `http(s)` `extensionUri`, and VS Code tells web extensions to read their own files
 * through `workspace.fs` on it. Read-only: `stat` always reports a file, and directories cannot be listed.
 */
@injectable()
export class FetchFileSystemProvider implements FileSystemProvider {

    readonly capabilities = FileSystemProviderCapabilities.Readonly | FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
    readonly onDidChangeCapabilities = Event.None;
    readonly onDidChangeFile: Event<readonly FileChange[]> = Event.None;
    readonly onFileWatchError = Event.None;

    async readFile(resource: URI): Promise<Uint8Array> {
        let response: Response;
        try {
            response = await fetch(resource.toString(true));
        } catch (error) {
            throw createFileSystemProviderError(error, FileSystemProviderErrorCode.Unknown);
        }
        if (response.status !== 200) {
            throw createFileSystemProviderError(`Could not read '${resource.toString(true)}': ${response.status} ${response.statusText}`, FileSystemProviderErrorCode.Unknown);
        }
        return new Uint8Array(await response.arrayBuffer());
    }

    async stat(resource: URI): Promise<Stat> {
        return {
            type: FileType.File,
            size: 0,
            mtime: 0,
            ctime: 0
        };
    }

    watch(): Disposable {
        return Disposable.NULL;
    }

    writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        throw this.notSupported();
    }

    readdir(resource: URI): Promise<[string, FileType][]> {
        throw this.notSupported();
    }

    mkdir(resource: URI): Promise<void> {
        throw this.notSupported();
    }

    delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        throw this.notSupported();
    }

    rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        throw this.notSupported();
    }

    protected notSupported(): Error {
        return createFileSystemProviderError('Not supported', FileSystemProviderErrorCode.Unavailable);
    }
}

/**
 * Registers the {@link FetchFileSystemProvider} for the `http` and `https` schemes on the frontend `FileService`.
 */
@injectable()
export class FetchFileServiceContribution implements FileServiceContribution {

    @inject(FetchFileSystemProvider)
    protected readonly provider: FetchFileSystemProvider;

    registerFileSystemProviders(service: FileService): void {
        service.registerProvider(Schemes.http, this.provider);
        service.registerProvider(Schemes.https, this.provider);
    }
}
