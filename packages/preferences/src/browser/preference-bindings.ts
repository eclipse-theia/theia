// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import { PreferenceProvider, PreferenceScope, TogglePreferenceProvider } from '@theia/core/lib/browser/preferences';
import { UserPreferenceProvider, UserPreferenceProviderFactory } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { WorkspaceFilePreferenceProvider, WorkspaceFilePreferenceProviderFactory, WorkspaceFilePreferenceProviderOptions } from './workspace-file-preference-provider';
import { FoldersPreferencesProvider } from './folders-preferences-provider';
import { FolderPreferenceProvider, FolderPreferenceProviderFactory, FolderPreferenceProviderFolder } from './folder-preference-provider';
import { UserConfigsPreferenceProvider } from './user-configs-preference-provider';
import { SectionPreferenceProviderUri, SectionPreferenceProviderSection } from './section-preference-provider';
import { WorkspaceService } from '@theia/workspace/lib/browser';

export function bindWorkspaceFilePreferenceProvider(bind: interfaces.Bind): void {
    bind(WorkspaceFilePreferenceProviderFactory).toFactory(ctx => (options: WorkspaceFilePreferenceProviderOptions) => {
        const child = ctx.container.createChild();
        child.bind(WorkspaceFilePreferenceProvider).toSelf().inSingletonScope();
        child.bind(WorkspaceFilePreferenceProviderOptions).toConstantValue(options);
        return child.get(WorkspaceFilePreferenceProvider);
    });
}

export function bindFactory<F, C>(
    bind: interfaces.Bind,
    factoryId: interfaces.ServiceIdentifier<F>,
    constructor: interfaces.Newable<C>,
    ...parameterBindings: interfaces.ServiceIdentifier<unknown>[]
): void {
    bind(factoryId).toFactory(ctx => (...args: unknown[]) => {
        const child = ctx.container.createChild();
        parameterBindings.forEach((parameterBinding, i) => {
            child.bind(parameterBinding).toConstantValue(args[i]);
        });
        child.bind(constructor).to(constructor).inSingletonScope();
        return child.get(constructor);
    });
}

export function bindPreferenceProviders(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    unbind(PreferenceProvider);
    // #region bind FoldersPreferencesProvider based on the status of the workspace:
    bind(FoldersPreferencesProvider)
        .toSelf()
        .inSingletonScope()
        .whenTargetIsDefault();
    // Bind a FoldersPreferencesProvider that's only enabled if the workspace
    // is a single root workspace:
    bind<PreferenceProvider>(FoldersPreferencesProvider)
        .toDynamicValue(ctx => {
            const workspaceService = ctx.container.get(WorkspaceService);
            const foldersPreferencesProvider = ctx.container.get(FoldersPreferencesProvider);
            const preferenceProvider = new TogglePreferenceProvider(!workspaceService.isMultiRootWorkspaceOpened, foldersPreferencesProvider);
            workspaceService.onWorkspaceChanged(() => {
                preferenceProvider.enabled = !workspaceService.isMultiRootWorkspaceOpened;
            });
            return preferenceProvider;
        })
        .inSingletonScope()
        .whenTargetNamed(PreferenceScope.Workspace);
    // Bind a FoldersPreferencesProvider that's only enabled if the workspace
    // is a multi root workspace:
    bind<PreferenceProvider>(FoldersPreferencesProvider)
        .toDynamicValue(ctx => {
            const workspaceService = ctx.container.get(WorkspaceService);
            const foldersPreferencesProvider = ctx.container.get(FoldersPreferencesProvider);
            const preferenceProvider = new TogglePreferenceProvider(workspaceService.isMultiRootWorkspaceOpened, foldersPreferencesProvider);
            workspaceService.onWorkspaceChanged(() => {
                preferenceProvider.enabled = workspaceService.isMultiRootWorkspaceOpened;
            });
            return preferenceProvider;
        })
        .inSingletonScope()
        .whenTargetNamed(PreferenceScope.Folder);
    // #endregion
    // #region bind PreferenceProvider by PreferenceScope:
    bind(PreferenceProvider)
        .to(UserConfigsPreferenceProvider)
        .inSingletonScope()
        .whenTargetNamed(PreferenceScope.User);
    bind(PreferenceProvider)
        .to(WorkspacePreferenceProvider)
        .inSingletonScope()
        .whenTargetNamed(PreferenceScope.Workspace);
    bind(PreferenceProvider)
        .toDynamicValue(ctx => ctx.container.getNamed(FoldersPreferencesProvider, PreferenceScope.Folder))
        .inSingletonScope()
        .whenTargetNamed(PreferenceScope.Folder);
    // #endregion
    bindWorkspaceFilePreferenceProvider(bind);
    bindFactory(bind, UserPreferenceProviderFactory, UserPreferenceProvider, SectionPreferenceProviderUri, SectionPreferenceProviderSection);
    bindFactory(bind, FolderPreferenceProviderFactory, FolderPreferenceProvider, SectionPreferenceProviderUri, SectionPreferenceProviderSection, FolderPreferenceProviderFolder);
}
