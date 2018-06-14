/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject, named } from 'inversify';
import { json } from 'body-parser';
import { Application, Router } from 'express';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
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

    configure(app: Application): void {
        const router = Router();
        router.get('/', (request, response) => this.singleFileDownloadHandler.handle(request, response));
        router.put('/', (request, response) => this.multiFileDownloadHandler.handle(request, response));
        // Content-Type: application/json
        app.use(json());
        app.use(FileDownloadEndpoint.PATH, router);
    }

}
