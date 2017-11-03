/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule } from "inversify";
import { ConnectionHandler, JsonRpcConnectionHandler } from '@theia/core/lib/common';
import { FileSearchServiceImpl } from './file-search-service-impl';
import { fileSearchServicePath, FileSearchService } from '../common/file-search-service';

export default new ContainerModule(bind => {

    bind(FileSearchService).to(FileSearchServiceImpl).inSingletonScope();
    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler(fileSearchServicePath, () =>
            ctx.container.get(FileSearchService)
        )
    ).inSingletonScope();
});
