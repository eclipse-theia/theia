/********************************************************************************
 * Copyright (C) 2019 Bitsler and others.
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
import { injectable, inject } from '@theia/core/shared/inversify';
import { ILogger } from '@theia/core/lib/common/logger';
import * as rimraf from 'rimraf';

export interface DownloadStorageItem {
    file: string;
    root?: string;
    size: number;
    remove: boolean;
    expire?: number;
}

@injectable()
export class FileDownloadCache {

    @inject(ILogger)
    protected readonly logger: ILogger;
    protected readonly downloads = new Map<string, DownloadStorageItem>();
    protected readonly expireTimeInMinutes: number = 1;

    addDownload(id: string, downloadInfo: DownloadStorageItem): void {
        downloadInfo.file = encodeURIComponent(downloadInfo.file);
        if (downloadInfo.root) {
            downloadInfo.root = encodeURIComponent(downloadInfo.root);
        }
        // expires in 1 minute enough for parallel connections to be connected.
        downloadInfo.expire = Date.now() + (this.expireTimeInMinutes * 600000);
        this.downloads.set(id, downloadInfo);
    }

    getDownload(id: string): DownloadStorageItem | undefined {
        this.expireDownloads();
        const downloadInfo = this.downloads.get(id);
        if (downloadInfo) {

            downloadInfo.file = decodeURIComponent(downloadInfo.file);
            if (downloadInfo.root) {
                downloadInfo.root = decodeURIComponent(downloadInfo.root);
            }
        }
        return downloadInfo;
    }

    deleteDownload(id: string): void {
        const downloadInfo = this.downloads.get(id);
        if (downloadInfo && downloadInfo.remove) {
            this.deleteRecursively(downloadInfo.root || downloadInfo.file);
        }
        this.downloads.delete(id);
    }

    values(): { [key: string]: DownloadStorageItem } {
        this.expireDownloads();
        return [...this.downloads.entries()].reduce((downloads, [key, value]) => ({ ...downloads, [key]: value }), {});
    }

    protected deleteRecursively(pathToDelete: string): void {
        rimraf(pathToDelete, error => {
            if (error) {
                this.logger.warn(`An error occurred while deleting the temporary data from the disk. Cannot clean up: ${pathToDelete}.`, error);
            }
        });
    }

    protected expireDownloads(): void {
        const time = Date.now();
        for (const [id, download] of this.downloads.entries()) {
            if (download.expire && download.expire <= time) {
                this.deleteDownload(id);
            }
        }
    }
}
