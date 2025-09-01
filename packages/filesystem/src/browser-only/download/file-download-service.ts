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

@injectable()
export class FileDownloadServiceImpl implements FileDownloadService {
    
    @inject(FileService)
    protected readonly fileService: FileService;

    protected anchor: HTMLAnchorElement | undefined;
    protected downloadCounter: number = 0;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    async download(uris: URI[]): Promise<void> {
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
            this.logger.error(`Error occurred when downloading: ${uris.map(u => u.toString(true))}.`, e);
        }
    }
        

    protected async doDownload(uris: URI[], abortSignal: AbortSignal): Promise<void> {
        console.log('doDownload', uris, abortSignal);
        
        // let url: string | undefined;
        // try {
        //     if (this.anchor === undefined) {
        //         this.anchor = document.createElement('a');
        //     }
        //     const endpoint = this.endpoint();
        //     url = `${endpoint}/download/?id=${id}`;
        //     this.anchor.href = url;
        //     this.anchor.style.display = 'none';
        //     this.anchor.download = title;
        //     document.body.appendChild(this.anchor);
        //     this.anchor.click();
        // } finally {
        //     // make sure anchor is removed from parent
        //     if (this.anchor && this.anchor.parentNode) {
        //         this.anchor.parentNode.removeChild(this.anchor);
        //     }
        //     if (url) {
        //         URL.revokeObjectURL(url);
        //     }
        // }
    }
}
