// *****************************************************************************
// Copyright (C) 2025 Maksim Kachurin and others.
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
import URI from '@theia/core/lib/common/uri';
import { ILogger } from '@theia/core/lib/common/logger';
import { MessageService } from '@theia/core/lib/common/message-service';
import { nls } from '@theia/core';
import { FileService } from '../../browser/file-service';
import type { FileDownloadService } from '../../common/download/file-download';
import * as tarStream from 'tar-stream';
import { minimatch } from 'minimatch';

const IGNORE_PATTERNS = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.cache/**',
    '**/.DS_Store',
    '**/Thumbs.db',
    '**/desktop.ini',
    '**/*.tmp',
    '**/*.temp',
    '**/.vscode/**',
    '**/.idea/**',
];

@injectable()
export class FileDownloadServiceImpl implements FileDownloadService {

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    async download(uris: URI[], options?: never): Promise<void> {
        if (uris.length === 0) {
            return;
        }

        const abortController = new AbortController();

        try {
            const text = nls.localize('theia/filesystem/prepareDownload', 'Preparing download...');

            const [progress] = await Promise.all([
                this.messageService.showProgress({
                    text,
                    options: { cancelable: true }
                }, () => {
                    abortController.abort();
                }),
                this.doDownload(uris, abortController.signal)
            ]);

            progress.cancel();
        } catch (e) {
            if (!abortController.signal.aborted) {
                this.logger.error(`Error occurred when downloading: ${uris.map(u => u.toString(true))}.`, e);
                // Show user-friendly error message
                this.messageService.error(nls.localize('theia/filesystem/downloadError', 'Failed to download files. See console for details.'));
            }
        }
    }

    protected async doDownload(uris: URI[], abortSignal: AbortSignal): Promise<void> {
        try {
            if (uris.length === 1) {
                await this.downloadSingle(uris[0], abortSignal);
            } else {
                await this.downloadMultiple(uris, abortSignal);
            }
        } catch (error) {
            if (!abortSignal.aborted) {
                this.logger.error('Failed to download files', error);
                throw error;
            }
        }
    }

    protected async downloadSingle(uri: URI, abortSignal: AbortSignal): Promise<void> {
        const stat = await this.fileService.resolve(uri);

        let data: Blob;
        let isArchive: boolean = true;

        if (stat.isDirectory) {
            // Create tar archive for directory
            data = await this.createDirectoryArchive(uri, stat.name, abortSignal);
            isArchive = true;
        } else {
            // Download single file
            const content = await this.fileService.readFile(uri);
            data = new Blob([content.value.buffer], { type: 'application/octet-stream' });
            isArchive = false;
        }

        if (!abortSignal.aborted) {
            const filename = isArchive ? `${stat.name}.tar` : stat.name;
            await this.triggerDownload(data, filename, isArchive);
        }
    }

    protected async downloadMultiple(uris: URI[], abortSignal: AbortSignal): Promise<void> {
        const data = await this.createMultiSelectionArchive(uris, abortSignal);

        if (!abortSignal.aborted) {
            await this.triggerDownload(data, 'theia-download.tar', true);
        }
    }

    protected async createDirectoryArchive(dirUri: URI, dirName: string, abortSignal: AbortSignal): Promise<Blob> {
        return this.createArchive(abortSignal, async tarPack => {
            await this.addDirectoryToArchive(tarPack, dirUri, this.sanitizeFilename(dirName), abortSignal);
        });
    }

    protected async createMultiSelectionArchive(uris: URI[], abortSignal: AbortSignal): Promise<Blob> {
        return this.createArchive(abortSignal, async tarPack => {
            for (const uri of uris) {
                if (abortSignal.aborted) {break; }

                try {
                    const stat = await this.fileService.resolve(uri);
                    if (abortSignal.aborted) {break; }

                    // Each selected item appears in the archive with its own name
                    const entryName = this.sanitizeFilename(stat.name);
                    if (this.shouldExclude(entryName)) {
                        continue;
                    }

                    if (stat.isDirectory) {
                        await this.addDirectoryToArchive(tarPack, uri, entryName, abortSignal);
                    } else {
                        await this.addFileToArchive(tarPack, uri, entryName, abortSignal);
                    }
                } catch (error) {
                    this.logger.warn(`Failed to add ${uri.toString()} to archive:`, error);
                    // Continue with other items
                }
            }
        });
    }

    protected async addDirectoryToArchive(tarPack: tarStream.Pack, dirUri: URI, basePath: string, abortSignal: AbortSignal): Promise<void> {
        if (abortSignal.aborted) {
            return; 
        }

        try {
            const dirStat = await this.fileService.resolve(dirUri, { resolveMetadata: false });
            if (abortSignal.aborted) {
                return; 
            }

            // Add empty directory entry if it has no children
            if (!dirStat.children?.length) {
                if (basePath) {
                    tarPack.entry({ name: this.sanitizeFilename(`${basePath}/`), type: 'directory' });
                }
                return;
            }

            // Process children sequentially to maintain tar stream integrity
            for (const child of dirStat.children) {
                if (abortSignal.aborted) {break; }

                const childPath = basePath ? `${basePath}/${child.name}` : child.name;

                if (this.shouldExclude(childPath)) {
                    continue;
                }

                try {
                    if (child.isDirectory) {
                        await this.addDirectoryToArchive(tarPack, child.resource, childPath, abortSignal);
                    } else {
                        await this.addFileToArchive(tarPack, child.resource, childPath, abortSignal);
                    }
                } catch (error) {
                    this.logger.error(`Failed to add ${child.resource.toString()} to archive:`, error);
                    // Continue with other children
                }
            }
        } catch (error) {
            this.logger.error(`Failed to resolve directory ${dirUri.toString()}:`, error);
            throw error;
        }
    }

    protected async addFileToArchive(tarPack: tarStream.Pack, fileUri: URI, entryPath: string, abortSignal: AbortSignal): Promise<void> {
        if (abortSignal.aborted) {
            return; 
        }

        try {
            const content = await this.fileService.readFile(fileUri);
            if (abortSignal.aborted) {
                return; 
            }

            const bytes = content.value.buffer;
            const name = this.sanitizeFilename(entryPath);

            tarPack.entry({ name, size: bytes.byteLength }, Buffer.from(bytes));
        } catch (error) {
            this.logger.error(`Failed to read file ${fileUri.toString()}:`, error);
            throw error;
        }
    }

    protected createTarPack(): tarStream.Pack {
        return tarStream.pack();
    }

    /**
     * Generic archive creation method that handles all the boilerplate
     */
    protected async createArchive(abortSignal: AbortSignal, populateArchive: (tarPack: tarStream.Pack) => Promise<void>): Promise<Blob> {
        if (abortSignal.aborted) {
            throw new Error('Operation aborted');
        }

        const tarPack = this.createTarPack();
        const chunks: Uint8Array[] = [];

        return new Promise<Blob>((resolve, reject) => {
            const cleanup = () => {
                tarPack.removeAllListeners();
            };

            const onAbort = () => {
                cleanup();
                reject(new Error('Operation aborted'));
            };

            abortSignal.addEventListener('abort', onAbort);

            tarPack.on('data', (chunk: Uint8Array) => {
                if (abortSignal.aborted) {
                    return; 
                }
                chunks.push(chunk);
            });

            tarPack.on('end', () => {
                cleanup();
                abortSignal.removeEventListener('abort', onAbort);
                try {
                    const blob = new Blob(chunks, { type: 'application/x-tar' });
                    resolve(blob);
                } catch (error) {
                    reject(error);
                }
            });

            tarPack.on('error', error => {
                cleanup();
                abortSignal.removeEventListener('abort', onAbort);
                reject(error);
            });

            // Execute the archive population logic
            populateArchive(tarPack)
                .then(() => {
                    if (!abortSignal.aborted) {
                        tarPack.finalize();
                    }
                })
                .catch(error => {
                    cleanup();
                    abortSignal.removeEventListener('abort', onAbort);
                    reject(error);
                });
        });
    }

    protected async triggerDownload(data: Blob, filename: string, isArchive: boolean): Promise<void> {
        // Memory-efficient download (works only in Chrome-based browsers)
        if (isArchive && 'showSaveFilePicker' in globalThis) {
            try {
                await this.streamDownload(data, filename);
                return;
            } catch (error) {
                // Check if the error is due to user cancellation
                if (error instanceof Error && (
                    error.name === 'AbortError' ||
                    error.message.includes('aborted') ||
                    error.message.includes('cancelled') ||
                    error.message.includes('canceled')
                )) {
                    return;
                }

                this.logger.warn('Streaming download failed, falling back to blob download:', error);
                // Fall through to blob download for other errors
            }
        }

       this.blobDownload(data, filename);
    }

    protected async streamDownload(data: Blob, filename: string): Promise<void> {
        // @ts-expect-error showSaveFilePicker is not standard API and works in Chrome-based browsers only
        const fileHandle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{
                description: 'Archive files',
                accept: { 'application/x-tar': ['.tar'] }
            }]
        });

        const writable = await fileHandle.createWritable();
        await writable.write(data);
        await writable.close();
    }

    protected blobDownload(data: Blob, filename: string): void {
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
    }

    protected sanitizeFilename(filename: string): string {
        return filename
            .replace(/[\\:*?"<>|]/g, '_') // Replace Windows-problematic chars
            .replace(/\.\./g, '__') // Replace .. to prevent directory traversal
            .replace(/^\/+/g, '') // Remove leading slashes
            .replace(/\/+$/, '') // Remove trailing slashes for files
            .replace(/\/+/g, '/') // Collapse multiple slashes
            .replace(/^\.$/, '_') // Replace single dot
            .replace(/^$/, '_'); // Replace empty string
    }

    protected shouldExclude(path: string): boolean {
        return IGNORE_PATTERNS.some(pattern => minimatch(path, pattern));
    }
}
