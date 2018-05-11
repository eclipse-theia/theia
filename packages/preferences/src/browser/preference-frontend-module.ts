/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { ContainerModule, interfaces, } from 'inversify';
import { PreferenceProvider, PreferenceScope } from "@theia/core/lib/browser/preferences";
import { UserPreferenceProvider } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { PreferenceFrontendContribution } from './preference-frontend-contribution';
import { MenuContribution, CommandContribution } from '@theia/core/lib/common';

export function bindPreferences(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    unbind(PreferenceProvider);

    bind(PreferenceProvider).to(UserPreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bind(PreferenceProvider).to(WorkspacePreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);

    bind(PreferenceFrontendContribution).toSelf().inSingletonScope();
    bind(CommandContribution).toService(PreferenceFrontendContribution);
    bind(MenuContribution).toService(PreferenceFrontendContribution);

}

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindPreferences(bind, unbind);
});
