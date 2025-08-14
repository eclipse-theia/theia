// *****************************************************************************
// Copyright (C) 2025 STMicroelectronics and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import { UserPreferenceProvider, UserPreferenceProviderFactory } from '../common/user-preference-provider';
import { SectionPreferenceProviderUri, SectionPreferenceProviderSection } from '../common/section-preference-provider';
import { bindFactory, PreferenceProvider, PreferenceScope, URI } from '@theia/core';
import { UserConfigsPreferenceProvider, UserStorageLocationProvider } from '../common/user-configs-preference-provider';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';

export function bindPreferenceProviders(bind: interfaces.Bind): void {
    bind(UserStorageLocationProvider).toDynamicValue(context => async () => {
        const env: EnvVariablesServer = context.container.get(EnvVariablesServer);
        return new URI(await env.getConfigDirUri());
    });
    bind(PreferenceProvider).to(UserConfigsPreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bindFactory(bind, UserPreferenceProviderFactory, UserPreferenceProvider, SectionPreferenceProviderUri, SectionPreferenceProviderSection);
}
