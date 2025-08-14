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

import { Container, interfaces } from '@theia/core/shared/inversify';
import { UserPreferenceProvider, UserPreferenceProviderFactory } from '../common/user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { WorkspaceFilePreferenceProvider, WorkspaceFilePreferenceProviderFactory, WorkspaceFilePreferenceProviderOptions } from './workspace-file-preference-provider';
import { FoldersPreferencesProvider } from './folders-preferences-provider';
import { FolderPreferenceProvider, FolderPreferenceProviderFactory, FolderPreferenceProviderFolder } from './folder-preference-provider';
import { SectionPreferenceProviderUri, SectionPreferenceProviderSection } from '../common/section-preference-provider';
import { bindFactory, PreferenceProvider, PreferenceScope } from '@theia/core';
import { UserStorageUri } from '@theia/userstorage/lib/browser';
import { UserConfigsPreferenceProvider, UserStorageLocationProvider } from '../common/user-configs-preference-provider';

export function bindWorkspaceFilePreferenceProvider(bind: interfaces.Bind): void {
    bind(WorkspaceFilePreferenceProviderFactory).toFactory(ctx => (options: WorkspaceFilePreferenceProviderOptions) => {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = ctx.container;
        child.bind(WorkspaceFilePreferenceProvider).toSelf();
        child.bind(WorkspaceFilePreferenceProviderOptions).toConstantValue(options);
        return child.get(WorkspaceFilePreferenceProvider);
    });
}

export function bindPreferenceProviders(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    bind(PreferenceProvider).to(UserConfigsPreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bind(PreferenceProvider).to(WorkspacePreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);
    bind(PreferenceProvider).to(FoldersPreferencesProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Folder);
    bindWorkspaceFilePreferenceProvider(bind);
    bind(UserStorageLocationProvider).toConstantValue(() => UserStorageUri);
    bindFactory(bind, UserPreferenceProviderFactory, UserPreferenceProvider, SectionPreferenceProviderUri, SectionPreferenceProviderSection);
    bindFactory(bind, FolderPreferenceProviderFactory, FolderPreferenceProvider, SectionPreferenceProviderUri, SectionPreferenceProviderSection, FolderPreferenceProviderFolder);
}
