/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { Container, interfaces } from 'inversify';
import { PreferenceProvider, PreferenceScope } from '@theia/core/lib/browser/preferences';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { UserPreferenceProvider } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { WorkspaceFilePreferenceProvider, WorkspaceFilePreferenceProviderFactory, WorkspaceFilePreferenceProviderOptions } from './workspace-file-preference-provider';
import { FoldersPreferencesProvider } from './folders-preferences-provider';
import { FolderPreferenceProvider, FolderPreferenceProviderFactory, FolderPreferenceProviderOptions } from './folder-preference-provider';

export function bindWorkspaceFilePreferenceProvider(bind: interfaces.Bind): void {
    bind(WorkspaceFilePreferenceProviderFactory).toFactory(ctx => (options: WorkspaceFilePreferenceProviderOptions) => {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = ctx.container;
        child.bind(WorkspaceFilePreferenceProvider).toSelf();
        child.bind(WorkspaceFilePreferenceProviderOptions).toConstantValue(options);
        return child.get(WorkspaceFilePreferenceProvider);
    });
}

export function bindFolderPreferenceProvider(bind: interfaces.Bind): void {
    bind(FolderPreferenceProviderFactory).toFactory(ctx =>
        (options: FolderPreferenceProviderOptions) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            child.bind(FolderPreferenceProviderOptions).toConstantValue(options);
            const configurations = ctx.container.get(PreferenceConfigurations);
            if (configurations.isConfigUri(options.configUri)) {
                child.bind(FolderPreferenceProvider).toSelf();
                return child.get(FolderPreferenceProvider);
            }
            const sectionName = configurations.getName(options.configUri);
            return child.getNamed(FolderPreferenceProvider, sectionName);
        }
    );

}

export function bindPreferenceProviders(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    unbind(PreferenceProvider);

    bind(PreferenceProvider).to(UserPreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bind(PreferenceProvider).to(WorkspacePreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);
    bind(PreferenceProvider).to(FoldersPreferencesProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Folder);
    bindFolderPreferenceProvider(bind);
    bindWorkspaceFilePreferenceProvider(bind);
}
