/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */


import { ContainerModule } from "inversify"
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { GDBFrontendContribution } from './gdb-frontend-contribution';

export default new ContainerModule(bind => {
    bind(GDBFrontendContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(GDBFrontendContribution)
        ).inSingletonScope();
    }
});
