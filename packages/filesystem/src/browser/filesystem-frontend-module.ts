/********************************************************************************
 * Copyright (C) 2017-2018 TypeFox and others.
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

import '../../src/browser/style/index.css';

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { ResourceResolver, CommandContribution } from '@theia/core/lib/common';
import { WebSocketConnectionProvider, FrontendApplicationContribution, LabelProviderContribution } from '@theia/core/lib/browser';
import { FileResourceResolver } from './file-resource';
import { bindFileSystemPreferences } from './filesystem-preferences';
import { FileSystemWatcher } from './filesystem-watcher';
import { FileSystemFrontendContribution } from './filesystem-frontend-contribution';
import { FileUploadService } from './file-upload-service';
import { FileTreeLabelProvider } from './file-tree/file-tree-label-provider';
import { FileService, FileServiceContribution } from './file-service';
import { RemoteFileSystemProvider, RemoteFileSystemServer, remoteFileSystemPath, RemoteFileSystemProxyFactory } from '../common/remote-file-system-provider';
import { FileSystem, FileStat, FileMoveOptions, FileDeleteOptions, FileSystemError } from '../common/filesystem';
import URI from '@theia/core/lib/common/uri';
import { FileOperationError, FileOperationResult, BaseStatWithMetadata, FileStatWithMetadata, etag } from '../common/files';
import { TextDocumentContentChangeEvent } from '@theia/core/shared/vscode-languageserver-protocol';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { RemoteFileServiceContribution } from './remote-file-service-contribution';
import { FileSystemWatcherErrorHandler } from './filesystem-watcher-error-handler';
import { UTF8 } from '@theia/core/lib/common/encodings';

export default new ContainerModule(bind => {
    bindFileSystemPreferences(bind);

    bindContributionProvider(bind, FileServiceContribution);
    bind(FileService).toSelf().inSingletonScope();

    bind(RemoteFileSystemServer).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy(ctx.container, remoteFileSystemPath, new RemoteFileSystemProxyFactory())
    );
    bind(RemoteFileSystemProvider).toSelf().inSingletonScope();
    bind(RemoteFileServiceContribution).toSelf().inSingletonScope();
    bind(FileServiceContribution).toService(RemoteFileServiceContribution);

    bind(FileSystemWatcher).toSelf().inSingletonScope();
    bind(FileSystemWatcherErrorHandler).toSelf().inSingletonScope();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    bind(FileSystem).toDynamicValue(({ container }) => {
        const fileService = container.get(FileService);
        const environments = container.get<EnvVariablesServer>(EnvVariablesServer);
        const convertStat: (stat: BaseStatWithMetadata | FileStatWithMetadata) => FileStat = stat => ({
            uri: stat.resource.toString(),
            lastModification: stat.mtime,
            size: stat.size,
            isDirectory: 'isDirectory' in stat && stat.isDirectory,
            children: 'children' in stat ? stat.children?.map(convertStat) : undefined
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rethrowError: (uri: string, error: any) => never = (uri, error) => {
            if (error instanceof FileOperationError) {
                if (error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
                    throw FileSystemError.FileNotFound(uri);
                }
                if (error.fileOperationResult === FileOperationResult.FILE_IS_DIRECTORY) {
                    throw FileSystemError.FileIsDirectory(uri);
                }
                if (error.fileOperationResult === FileOperationResult.FILE_NOT_DIRECTORY) {
                    throw FileSystemError.FileNotDirectory(uri);
                }
                if (error.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
                    throw FileSystemError.FileIsOutOfSync(uri);
                }
            }
            throw error;
        };
        return new class implements FileSystem {
            async getFileStat(uri: string): Promise<FileStat | undefined> {
                try {
                    const stat = await fileService.resolve(new URI(uri), { resolveMetadata: true });
                    return convertStat(stat);
                } catch (e) {
                    if (e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
                        return undefined;
                    }
                    rethrowError(uri, e);
                }
            }
            exists(uri: string): Promise<boolean> {
                return fileService.exists(new URI(uri));
            }
            async resolveContent(uri: string, options?: { encoding?: string | undefined; } | undefined): Promise<{ stat: FileStat; content: string; }> {
                try {
                    const content = await fileService.read(new URI(uri), options);
                    return {
                        stat: convertStat(content),
                        content: content.value
                    };
                } catch (e) {
                    rethrowError(uri, e);
                }
            }
            async setContent(file: FileStat, content: string, options?: { encoding?: string | undefined; } | undefined): Promise<FileStat> {
                try {
                    const result = await fileService.write(new URI(file.uri), content, {
                        ...options,
                        mtime: file.lastModification
                    });
                    return convertStat(result);
                } catch (e) {
                    rethrowError(file.uri, e);
                }
            }
            async updateContent(file: FileStat, contentChanges: TextDocumentContentChangeEvent[], options?: {
                encoding?: string | undefined;
                overwriteEncoding?: string | undefined;
            } | undefined): Promise<FileStat> {
                try {
                    const result = await fileService.update(new URI(file.uri), contentChanges, {
                        mtime: file.lastModification,
                        etag: etag({ size: file.size, mtime: file.lastModification }),
                        readEncoding: options?.encoding || UTF8,
                        encoding: options?.overwriteEncoding,
                        overwriteEncoding: !!options?.overwriteEncoding
                    });
                    return convertStat(result);
                } catch (e) {
                    rethrowError(file.uri, e);
                }
            }
            async move(sourceUri: string, targetUri: string, options?: FileMoveOptions | undefined): Promise<FileStat> {
                try {
                    const result = await fileService.move(new URI(sourceUri), new URI(targetUri), options);
                    return convertStat(result);
                } catch (e) {
                    rethrowError(sourceUri, e);
                }
            }
            async copy(sourceUri: string, targetUri: string, options?: { overwrite?: boolean | undefined; recursive?: boolean | undefined; } | undefined): Promise<FileStat> {
                try {
                    const result = await fileService.copy(new URI(sourceUri), new URI(targetUri), options);
                    return convertStat(result);
                } catch (e) {
                    rethrowError(sourceUri, e);
                }
            }
            async createFile(uri: string, options?: { content?: string | undefined; encoding?: string | undefined; } | undefined): Promise<FileStat> {
                try {
                    const result = await fileService.create(new URI(uri), options?.content, { encoding: options?.encoding });
                    return convertStat(result);
                } catch (e) {
                    rethrowError(uri, e);
                }
            }
            async createFolder(uri: string): Promise<FileStat> {
                try {
                    const result = await fileService.createFolder(new URI(uri));
                    return convertStat(result);
                } catch (e) {
                    rethrowError(uri, e);
                }
            }
            touchFile(uri: string): Promise<FileStat> {
                throw new Error('Method not implemented.');
            }
            async delete(uri: string, options?: FileDeleteOptions | undefined): Promise<void> {
                try {
                    return await fileService.delete(new URI(uri), { useTrash: options?.moveToTrash, recursive: true });
                } catch (e) {
                    rethrowError(uri, e);
                }
            }
            async getEncoding(uri: string): Promise<string> {
                const { encoding } = await fileService.read(new URI(uri));
                return encoding;
            }
            async guessEncoding(uri: string): Promise<string | undefined> {
                const { encoding } = await fileService.read(new URI(uri), { autoGuessEncoding: true });
                return encoding;
            }
            async getRoots(): Promise<FileStat[]> {
                const drives = await environments.getDrives();
                const roots = await Promise.all(drives.map(uri => this.getFileStat(uri)));
                return roots.filter(root => !!root) as FileStat[];
            }
            async getCurrentUserHome(): Promise<FileStat | undefined> {
                return this.getFileStat(await environments.getHomeDirUri());
            }
            getDrives(): Promise<string[]> {
                return environments.getDrives();
            }
            access(uri: string, mode?: number | undefined): Promise<boolean> {
                return fileService.access(new URI(uri), mode);
            }
            getFsPath(uri: string): Promise<string | undefined> {
                return fileService.fsPath(new URI(uri));
            }

        };
    }).inSingletonScope();

    bindFileResource(bind);

    bind(FileUploadService).toSelf().inSingletonScope();

    bind(FileSystemFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(FileSystemFrontendContribution);
    bind(FrontendApplicationContribution).toService(FileSystemFrontendContribution);

    bind(FileTreeLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(FileTreeLabelProvider);
});

export function bindFileResource(bind: interfaces.Bind): void {
    bind(FileResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(FileResourceResolver);
}
