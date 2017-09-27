/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, } from 'inversify';
import { WebSocketConnectionProvider, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { KeymapsServer, keybindingsPath } from "../common/keymaps-protocol";
import { KeymapsService } from "../common/keymaps-service";
import { KeymapsFrontendContribution } from "./keymaps-frontend-contribution";
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';

export default new ContainerModule(bind => {

    bind(KeymapsFrontendContribution).toSelf().inSingletonScope();
    for (const identifier of [CommandContribution, MenuContribution]) {
        bind(identifier).toDynamicValue(ctx =>
            ctx.container.get(KeymapsFrontendContribution)
        ).inSingletonScope();
    }

    bind(FrontendApplicationContribution).to(KeymapsService).inSingletonScope();

    bind(KeymapsServer).toDynamicValue(ctx =>
        ctx.container.get(WebSocketConnectionProvider).createProxy(keybindingsPath)
    ).inSingletonScope();
});
