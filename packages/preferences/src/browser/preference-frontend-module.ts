/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, } from 'inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreferenceService, PreferenceServiceImpl } from "@theia/preferences-api/lib/browser/";
import { UserPreferenceProvider } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';

export default new ContainerModule(bind => {

    bind(FrontendApplicationContribution).toDynamicValue(ctx => ctx.container.get(PreferenceService));

    bind(UserPreferenceProvider).toSelf().inSingletonScope();
    bind(WorkspacePreferenceProvider).toSelf().inSingletonScope();

    bind(PreferenceService).toDynamicValue(ctx => {
        const userProvider = ctx.container.get<UserPreferenceProvider>(UserPreferenceProvider);
        const workspaceProvider = ctx.container.get<WorkspacePreferenceProvider>(WorkspacePreferenceProvider);

        return new PreferenceServiceImpl([userProvider, workspaceProvider]);
    }).inSingletonScope();
});
