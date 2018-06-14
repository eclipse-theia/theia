/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from 'inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { FileDownloadEndpoint } from './file-download-endpoint';
import { FileDownloadHandler, SingleFileDownloadHandler, MultiFileDownloadHandler } from './file-download-handler';
import { DirectoryArchiver } from './directory-archiver';

export default new ContainerModule(bind => {
    bind(FileDownloadEndpoint).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(FileDownloadEndpoint);
    bind(FileDownloadHandler).to(SingleFileDownloadHandler).inSingletonScope().whenTargetNamed(FileDownloadHandler.SINGLE);
    bind(FileDownloadHandler).to(MultiFileDownloadHandler).inSingletonScope().whenTargetNamed(FileDownloadHandler.MULTI);
    bind(DirectoryArchiver).toSelf().inSingletonScope();
});
