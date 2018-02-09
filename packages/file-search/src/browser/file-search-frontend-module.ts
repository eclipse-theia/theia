/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, interfaces } from 'inversify';
import { CommandContribution } from "@theia/core/lib/common";
import { WebSocketConnectionProvider, KeybindingContribution } from '@theia/core/lib/browser';
import { QuickFileOpenFrontendContribution } from './quick-file-open-contribution';
import { QuickFileOpenService } from './quick-file-open';
import { fileSearchServicePath, FileSearchService } from '../common/file-search-service';

export default new ContainerModule((bind: interfaces.Bind, unbind: interfaces.Unbind, isBound: interfaces.IsBound, rebind: interfaces.Rebind) => {
    bind(FileSearchService).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<FileSearchService>(fileSearchServicePath);
    }).inSingletonScope();

    bind(QuickFileOpenFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toDynamicValue(ctx => ctx.container.get(QuickFileOpenFrontendContribution));
    bind(KeybindingContribution).toDynamicValue(ctx => ctx.container.get(QuickFileOpenFrontendContribution));

    bind(QuickFileOpenService).toSelf().inSingletonScope();
});
