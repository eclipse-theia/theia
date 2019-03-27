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

import { injectable, inject, named } from 'inversify';
import { json } from 'body-parser';
// tslint:disable-next-line:no-implicit-dependencies
import { Application, Router, Request, Response, NextFunction } from 'express';
import * as formidable from 'formidable';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { FileDownloadHandler } from './file-download-handler';

// upload max file size in MB, default 2048
let uploadMaxFileSize = Number(process.env.THEIA_UPLOAD_MAX_FILE_SIZE);
if (typeof uploadMaxFileSize !== 'number' || Number.isNaN(uploadMaxFileSize) || !Number.isFinite(uploadMaxFileSize)) {
    uploadMaxFileSize = 2048;
}

@injectable()
export class FileDownloadEndpoint implements BackendApplicationContribution {

    protected static PATH = '/files';

    @inject(FileDownloadHandler)
    @named(FileDownloadHandler.SINGLE)
    protected readonly singleFileDownloadHandler: FileDownloadHandler;

    @inject(FileDownloadHandler)
    @named(FileDownloadHandler.MULTI)
    protected readonly multiFileDownloadHandler: FileDownloadHandler;

    configure(app: Application): void {
        const upload = this.upload.bind(this);
        const router = Router();
        router.get('/', (request, response) => this.singleFileDownloadHandler.handle(request, response));
        router.put('/', (request, response) => this.multiFileDownloadHandler.handle(request, response));
        router.post('/', upload);
        // Content-Type: application/json
        app.use(json());
        app.use(FileDownloadEndpoint.PATH, router);
    }

    protected upload(req: Request, res: Response, next: NextFunction): void {
        const form = new formidable.IncomingForm();
        form.multiples = true;
        form.maxFileSize = uploadMaxFileSize * 1024 * 1024;

        let targetUri: URI | undefined;
        const clientErrors: string[] = [];
        form.on('field', (name: string, value: string) => {
            if (name === 'target') {
                targetUri = new URI(value);
            }
        });
        form.on('fileBegin', (_: string, file: formidable.File) => {
            if (targetUri) {
                file.path = FileUri.fsPath(targetUri.resolve(file.name));
            } else {
                clientErrors.push(`cannot upload "${file.name}", target is not provided`);
            }
        });
        form.on('error', (error: Error) => {
            if (String(error).indexOf('maxFileSize') !== -1) {
                res.writeHead(413, 'Payload Exceeded ' + uploadMaxFileSize + 'MB');
            } else {
                console.error(error);
                res.writeHead(500, String(error));
            }
            res.end();
        });
        form.on('end', () => {
            if (clientErrors.length) {
                res.writeHead(400, clientErrors.join('\n'));
            } else {
                res.writeHead(200);
            }
            res.end();
        });
        form.parse(req);
    }

}
