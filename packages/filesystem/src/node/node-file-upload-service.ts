// *****************************************************************************
// Copyright (C) 2019 TypeFox and others.
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

import multer = require('multer');
import path = require('path');
import os = require('os');
import express = require('@theia/core/shared/express');
import fs = require('@theia/core/shared/fs-extra');
import { BackendApplicationContribution, FileUri } from '@theia/core/lib/node';
import { injectable } from '@theia/core/shared/inversify';
import { HTTP_FILE_UPLOAD_PATH } from '../common/file-upload';

@injectable()
export class NodeFileUploadService implements BackendApplicationContribution {
    private static readonly UPLOAD_DIR = 'theia_upload';

    async configure(app: express.Application): Promise<void> {
        const [dest, http_path] = await Promise.all([
            this.getTemporaryUploadDest(),
            this.getHttpFileUploadPath()
        ]);
        console.debug(`HTTP file upload URL path: ${http_path}`);
        console.debug(`Backend file upload cache path: ${dest}`);
        app.post(
            http_path,
            // `multer` handles `multipart/form-data` containing our file to upload.
            multer({ dest }).single('file'),
            (request, response, next) => this.handleFileUpload(request, response)
        );
    }

    /**
     * @returns URL path on which to accept file uploads.
     */
    protected async getHttpFileUploadPath(): Promise<string> {
        return HTTP_FILE_UPLOAD_PATH;
    }

    /**
     * @returns Path to a folder where to temporarily store uploads.
     */
    protected async getTemporaryUploadDest(): Promise<string> {
        return path.join(os.tmpdir(), NodeFileUploadService.UPLOAD_DIR);
    }

    protected async handleFileUpload(request: express.Request, response: express.Response): Promise<void> {
        const fields = request.body;
        if (!request.file || typeof fields !== 'object' || typeof fields.uri !== 'string') {
            response.sendStatus(400); // bad request
            return;
        }
        try {
            const target = FileUri.fsPath(fields.uri);
            if (!fields.leaveInTemp) {
                await fs.move(request.file.path, target, { overwrite: true });
            } else {
                // leave the file where it is, just rename it to its original name
                fs.rename(request.file.path, request.file.path.replace(request.file.filename, request.file.originalname));
            }
            response.status(200).send(target); // ok
        } catch (error) {
            console.error(error);
            if (error.message) {
                // internal server error with error message as response
                response.status(500).send(error.message);
            } else {
                // default internal server error
                response.sendStatus(500);
            }
        }
    }

}
