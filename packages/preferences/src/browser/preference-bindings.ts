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

import { Container, interfaces } from '@theia/core/shared/inversify';
import { PreferenceProvider, PreferenceScope } from '@theia/core/lib/browser/preferences';
import { UserPreferenceProvider, UserPreferenceProviderFactory } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { WorkspaceFilePreferenceProvider, WorkspaceFilePreferenceProviderFactory, WorkspaceFilePreferenceProviderOptions } from './workspace-file-preference-provider';
import { FoldersPreferencesProvider } from './folders-preferences-provider';
import { FolderPreferenceProvider, FolderPreferenceProviderFactory, FolderPreferenceProviderFolder } from './folder-preference-provider';
import { UserConfigsPreferenceProvider } from './user-configs-preference-provider';
import { SectionPreferenceProviderUri, SectionPreferenceProviderSection } from './section-preference-provider';

export function bindWorkspaceFilePreferenceProvider(bind: interfaces.Bind): void {
    bind(WorkspaceFilePreferenceProviderFactory).toFactory(ctx => (options: WorkspaceFilePreferenceProviderOptions) => {
        const child = new Container({ defaultScope: 'Singleton' });
        child.parent = ctx.container;
        child.bind(WorkspaceFilePreferenceProvider).toSelf();
        child.bind(WorkspaceFilePreferenceProviderOptions).toConstantValue(options);
        return child.get(WorkspaceFilePreferenceProvider);
    });
}

export function bindFactory<F, C>(bind: interfaces.Bind,
    factoryId: interfaces.ServiceIdentifier<F>,
    constructor: interfaces.Newable<C>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...parameterBindings: interfaces.ServiceIdentifier<any>[]): void {
    bind(factoryId).toFactory(ctx =>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (...args: any[]) => {
            const child = new Container({ defaultScope: 'Singleton' });
            child.parent = ctx.container;
            for (let i = 0; i < parameterBindings.length; i++) {
                child.bind(parameterBindings[i]).toConstantValue(args[i]);
            }
            child.bind(constructor).to(constructor);
            return child.get(constructor);
        }
    );
}

export function bindPreferenceProviders(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    unbind(PreferenceProvider);

    bind(PreferenceProvider).to(UserConfigsPreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bind(PreferenceProvider).to(WorkspacePreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);
    bind(PreferenceProvider).to(FoldersPreferencesProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Folder);
    bindWorkspaceFilePreferenceProvider(bind);
    bindFactory(bind, UserPreferenceProviderFactory, UserPreferenceProvider, SectionPreferenceProviderUri, SectionPreferenceProviderSection);
    bindFactory(bind, FolderPreferenceProviderFactory, FolderPreferenceProvider, SectionPreferenceProviderUri, SectionPreferenceProviderSection, FolderPreferenceProviderFolder);
}
