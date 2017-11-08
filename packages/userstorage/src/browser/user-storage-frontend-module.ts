/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, } from 'inversify';
import { ResourceResolver } from '@theia/core/lib/common';
import { UserStorageResolver } from './user-storage-resource';
import { UserStorageServiceFilesystemImpl } from './user-storage-service-filesystem';
import { UserStorageService } from './user-storage-service';

export default new ContainerModule(bind => {

    bind(UserStorageResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toDynamicValue(ctx => ctx.container.get(UserStorageResolver));

    bind(UserStorageService).to(UserStorageServiceFilesystemImpl).inSingletonScope();
});
