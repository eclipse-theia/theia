/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as url from 'url';
import { injectable, inject, named } from '@theia/core/shared/inversify';
import { json } from 'body-parser';
import { Application, Router } from '@theia/core/shared/express';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { FileDownloadHandler } from './file-download-handler';

@injectable()
export class FileDownloadEndpoint implements BackendApplicationContribution {

    protected static PATH = '/files';

    @inject(FileDownloadHandler)
    @named(FileDownloadHandler.SINGLE)
    protected readonly singleFileDownloadHandler: FileDownloadHandler;

    @inject(FileDownloadHandler)
    @named(FileDownloadHandler.MULTI)
    protected readonly multiFileDownloadHandler: FileDownloadHandler;

    @inject(FileDownloadHandler)
    @named(FileDownloadHandler.DOWNLOAD_LINK)
    protected readonly downloadLinkHandler: FileDownloadHandler;

    configure(app: Application): void {
        const router = Router();
        router.get('/download', (request, response) => this.downloadLinkHandler.handle(request, response));
        router.get('/', (request, response) => this.singleFileDownloadHandler.handle(request, response));
        router.put('/', (request, response) => this.multiFileDownloadHandler.handle(request, response));
        // Content-Type: application/json
        app.use(json());
        app.use(FileDownloadEndpoint.PATH, router);
        app.get('/file', (request, response) => {
            const uri = url.parse(request.url).query;
            if (!uri) {
                response.status(400).send('invalid uri');
                return;
            }
            const fsPath = FileUri.fsPath(decodeURIComponent(uri));
            response.sendFile(fsPath);
        });
    }

}
