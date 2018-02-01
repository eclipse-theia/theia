/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, interfaces, } from 'inversify';
import { PreferenceProviders } from "@theia/core/lib/browser/preferences";
import { UserPreferenceProvider } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';

export function bindPreferences(bind: interfaces.Bind, rebind: interfaces.Rebind): void {
    bind(UserPreferenceProvider).toSelf().inSingletonScope();
    bind(WorkspacePreferenceProvider).toSelf().inSingletonScope();

    rebind(PreferenceProviders).toFactory(ctx => () => {
        const userProvider = ctx.container.get(UserPreferenceProvider);
        const workspaceProvider = ctx.container.get(WorkspacePreferenceProvider);
        return [userProvider, workspaceProvider];
    });
}

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindPreferences(bind, rebind);
});
