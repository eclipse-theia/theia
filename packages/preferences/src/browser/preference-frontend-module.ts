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

import { Container, ContainerModule, interfaces } from 'inversify';
import { PreferenceProvider, PreferenceScope, bindDefaultPreferenceProvider } from '@theia/core/lib/browser/preferences';
import { UserPreferenceProvider } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { bindViewContribution, WidgetFactory } from '@theia/core/lib/browser';
import { PreferencesContribution } from './preferences-contribution';
import { createPreferencesTreeWidget } from './preference-tree-container';
import { PreferencesMenuFactory } from './preferences-menu-factory';
import { PreferencesContainer, PreferencesTreeWidget } from './preferences-tree-widget';
import { FoldersPreferencesProvider } from './folders-preferences-provider';
import { FolderPreferenceProvider, FolderPreferenceProviderFactory, FolderPreferenceProviderOptions } from './folder-preference-provider';

import './monaco-contribution';

export function bindPreferences(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    unbind(PreferenceProvider);

    bindDefaultPreferenceProvider(bind);
    bind(PreferenceProvider).to(UserPreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bind(PreferenceProvider).to(WorkspacePreferenceProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);
    bind(PreferenceProvider).to(FoldersPreferencesProvider).inSingletonScope().whenTargetNamed(PreferenceScope.Folders);
    bind(FolderPreferenceProvider).toSelf().inTransientScope();
    bind(FolderPreferenceProviderFactory).toFactory(ctx =>
        (options: FolderPreferenceProviderOptions) => {
            const child = new Container({ defaultScope: 'Transient' });
            child.parent = ctx.container;
            child.bind(FolderPreferenceProviderOptions).toConstantValue(options);
            return child.get(FolderPreferenceProvider);
        }
    );

    bindViewContribution(bind, PreferencesContribution);

    bind(PreferencesContainer).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: PreferencesContainer.ID,
        createWidget: () => container.get(PreferencesContainer)
    }));

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: PreferencesTreeWidget.ID,
        createWidget: () => createPreferencesTreeWidget(container)
    })).inSingletonScope();

    bind(PreferencesMenuFactory).toSelf();
}

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindPreferences(bind, unbind);
});
