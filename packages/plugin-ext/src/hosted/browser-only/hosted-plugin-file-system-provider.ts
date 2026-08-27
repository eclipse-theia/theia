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
// ****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Disposable, Event, Emitter, URI } from '@theia/core';
import {
    createFileSystemProviderError, FileChange, FileDeleteOptions, FileOverwriteOptions, FilePermission, FileSystemProvider, FileSystemProviderCapabilities,
    FileSystemProviderErrorCode, FileType, FileWriteOptions, Stat, WatchOptions
} from '@theia/filesystem/lib/common/files';
import { FileService, FileServiceContribution } from '@theia/filesystem/lib/browser/file-service';
import { PLUGINS_BASE_PATH, PLUGINS_SCHEME } from '@theia/plugin-utils/lib/common/constants';
import { encodePluginAssetPath } from '@theia/plugin-utils/lib/common/plugin-model';

/**
 * Reads the plugin assets the build dropped under `PLUGINS_BASE_PATH`. With a backend those come
 * off its disk via `file:`; browser-only has to fetch them over HTTP.
 *
 * Read-only, and only for what goes through the `FileService`: color themes, icon themes, icon
 * fonts.
 */
@injectable()
export class HostedPluginFileSystemProvider implements FileSystemProvider {

    readonly capabilities = FileSystemProviderCapabilities.Readonly | FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
    readonly onDidChangeCapabilities = Event.None;
    readonly onFileWatchError = Event.None;

    protected readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

    watch(resource: URI, opts: WatchOptions): Disposable {
        // baked into the build, nothing to watch
        return Disposable.NULL;
    }

    async stat(resource: URI): Promise<Stat> {
        const response = await this.fetch(resource, 'HEAD');
        const length = Number(response.headers.get('content-length'));
        const modified = Date.parse(response.headers.get('last-modified') ?? '');
        // Build output, so created and modified are the same. Falling back to 0 rather than
        // `Date.now()` keeps it stable - callers cache on `mtime`.
        const mtime = Number.isNaN(modified) ? 0 : modified;
        return {
            type: FileType.File,
            permissions: FilePermission.Readonly,
            mtime,
            ctime: mtime,
            size: Number.isNaN(length) ? 0 : length
        };
    }

    async readFile(resource: URI): Promise<Uint8Array> {
        const response = await this.fetch(resource, 'GET');
        return new Uint8Array(await response.arrayBuffer());
    }

    /**
     * Maps the URI back to the path the build actually wrote, resolved against `document.baseURI`
     * so this still works when the application is deployed under a sub-path. `URI.path` is decoded,
     * so it has to be re-encoded - otherwise a `#` or `?` in an asset name would be read as a
     * fragment or query by `URL`.
     */
    protected toUrl(resource: URI): string {
        return new URL(`${PLUGINS_BASE_PATH}${encodePluginAssetPath(resource.path.toString())}`, document.baseURI).toString();
    }

    protected async fetch(resource: URI, method: 'GET' | 'HEAD'): Promise<Response> {
        if (resource.scheme !== PLUGINS_SCHEME) {
            throw createFileSystemProviderError(`Not a plugin asset: '${resource.toString()}'`, FileSystemProviderErrorCode.FileNotFound);
        }
        let response: Response;
        try {
            response = await fetch(this.toUrl(resource), { method });
        } catch (error) {
            throw createFileSystemProviderError(`Could not read '${resource.toString()}': ${error.message}`, FileSystemProviderErrorCode.Unavailable);
        }
        if (!response.ok) {
            // A static server 404s for directories too, but nothing asks us for one.
            const code = response.status === 404 ? FileSystemProviderErrorCode.FileNotFound : FileSystemProviderErrorCode.Unknown;
            throw createFileSystemProviderError(`Could not read '${resource.toString()}': ${response.status} ${response.statusText}`, code);
        }
        return response;
    }

    readdir(resource: URI): Promise<[string, FileType][]> {
        throw createFileSystemProviderError('Plugin assets cannot be listed.', FileSystemProviderErrorCode.FileNotADirectory);
    }

    mkdir(resource: URI): Promise<void> {
        throw createFileSystemProviderError('Plugin assets are read-only.', FileSystemProviderErrorCode.NoPermissions);
    }

    delete(resource: URI, opts: FileDeleteOptions): Promise<void> {
        throw createFileSystemProviderError('Plugin assets are read-only.', FileSystemProviderErrorCode.NoPermissions);
    }

    rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        throw createFileSystemProviderError('Plugin assets are read-only.', FileSystemProviderErrorCode.NoPermissions);
    }

    writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        throw createFileSystemProviderError('Plugin assets are read-only.', FileSystemProviderErrorCode.NoPermissions);
    }
}

@injectable()
export class HostedPluginFileServiceContribution implements FileServiceContribution {

    @inject(HostedPluginFileSystemProvider)
    protected readonly provider: HostedPluginFileSystemProvider;

    registerFileSystemProviders(service: FileService): void {
        service.registerProvider(PLUGINS_SCHEME, this.provider);
    }
}
