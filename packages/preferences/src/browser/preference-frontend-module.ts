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

import '../../src/browser/style/index.css';
import './preferences-monaco-contribution';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { bindViewContribution } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { PreferenceTreeGenerator } from './util/preference-tree-generator';
import { bindPreferenceProviders } from './preference-bindings';
import { bindPreferencesWidgets } from './views/preference-widget-bindings';
import { PreferencesContribution } from './preferences-contribution';
import { PreferenceScopeCommandManager } from './util/preference-scope-command-manager';
import { JsonSchemaContribution } from '@theia/core/lib/browser/json-schema-store';
import { PreferencesJsonSchemaContribution } from './preferences-json-schema-contribution';

export function bindPreferences(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    bindPreferenceProviders(bind, unbind);
    bindPreferencesWidgets(bind);

    bind(PreferenceTreeGenerator).toSelf().inSingletonScope();

    bindViewContribution(bind, PreferencesContribution);

    bind(PreferenceScopeCommandManager).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(PreferencesContribution);

    bind(PreferencesJsonSchemaContribution).toSelf().inSingletonScope();
    bind(JsonSchemaContribution).toService(PreferencesJsonSchemaContribution);
}

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindPreferences(bind, unbind);
});
