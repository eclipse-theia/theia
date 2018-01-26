/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, interfaces, } from 'inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreferenceService, PreferenceServiceImpl, PreferenceProviders } from "@theia/preferences-api";
import { UserPreferenceProvider } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';

export function bindPreferences(bind: interfaces.Bind): void {
    bind(UserPreferenceProvider).toSelf().inSingletonScope();
    bind(WorkspacePreferenceProvider).toSelf().inSingletonScope();

    bind(PreferenceProviders).toFactory(ctx => () => {
        const userProvider = ctx.container.get(UserPreferenceProvider);
        const workspaceProvider = ctx.container.get(WorkspacePreferenceProvider);
        return [userProvider, workspaceProvider];
    });
    bind(PreferenceServiceImpl).toSelf().inSingletonScope();

    for (const serviceIdentifier of [PreferenceService, FrontendApplicationContribution]) {
        bind(serviceIdentifier).toDynamicValue(ctx => ctx.container.get(PreferenceServiceImpl)).inSingletonScope();
    }
}

export default new ContainerModule(bind => {
    bindPreferences(bind);
});
