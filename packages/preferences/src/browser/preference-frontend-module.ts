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

import { ContainerModule, interfaces } from 'inversify';
import { bindViewContribution, WidgetFactory, FrontendApplicationContribution } from '@theia/core/lib/browser';
import { PreferencesContribution } from './preferences-contribution';
import { createPreferencesTreeWidget } from './preference-tree-container';
import { PreferencesMenuFactory } from './preferences-menu-factory';
import { PreferencesFrontendApplicationContribution } from './preferences-frontend-application-contribution';
import { PreferencesContainer, PreferencesTreeWidget, PreferencesEditorsContainer } from './preferences-tree-widget';
import { bindPreferenceProviders } from './preference-bindings';

import './preferences-monaco-contribution';

export function bindPreferences(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    bindPreferenceProviders(bind, unbind);

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

    bind(PreferencesEditorsContainer).toSelf();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: PreferencesEditorsContainer.ID,
        createWidget: () => container.get(PreferencesEditorsContainer)
    }));

    bind(PreferencesMenuFactory).toSelf();
    bind(FrontendApplicationContribution).to(PreferencesFrontendApplicationContribution).inSingletonScope();
}

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindPreferences(bind, unbind);
});
