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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/index.css';
import './preferences-monaco-contribution';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { bindViewContribution, FrontendApplicationContribution, noopWidgetStatusBarContribution, OpenHandler, WidgetStatusBarContribution } from '@theia/core/lib/browser';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { PreferenceTreeGenerator } from './util/preference-tree-generator';
import { bindPreferenceProviders } from './preference-bindings';
import { bindPreferencesWidgets } from './views/preference-widget-bindings';
import { PreferencesContribution } from './preferences-contribution';
import { PreferenceScopeCommandManager } from './util/preference-scope-command-manager';
import { JsonSchemaContribution } from '@theia/core/lib/browser/json-schema-store';
import { PreferencesJsonSchemaContribution } from './preferences-json-schema-contribution';
import { MonacoJSONCEditor } from './monaco-jsonc-editor';
import { PreferenceTransaction, PreferenceTransactionFactory, preferenceTransactionFactoryCreator } from './preference-transaction-manager';
import { PreferenceOpenHandler } from './preference-open-handler';
import { CliPreferences, CliPreferencesPath } from '../common/cli-preferences';
import { ServiceConnectionProvider } from '@theia/core/lib/browser/messaging/service-connection-provider';
import { PreferenceFrontendContribution } from './preference-frontend-contribution';
import { PreferenceLayoutProvider } from './util/preference-layout';
import { PreferencesWidget } from './views/preference-widget';

export function bindPreferences(bind: interfaces.Bind, unbind: interfaces.Unbind): void {
    bindPreferenceProviders(bind, unbind);
    bindPreferencesWidgets(bind);

    bind(PreferenceTreeGenerator).toSelf().inSingletonScope();
    bind(PreferenceLayoutProvider).toSelf().inSingletonScope();

    bindViewContribution(bind, PreferencesContribution);

    bind(PreferenceOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(PreferenceOpenHandler);

    bind(PreferenceScopeCommandManager).toSelf().inSingletonScope();
    bind(TabBarToolbarContribution).toService(PreferencesContribution);

    bind(PreferencesJsonSchemaContribution).toSelf().inSingletonScope();
    bind(JsonSchemaContribution).toService(PreferencesJsonSchemaContribution);

    bind(MonacoJSONCEditor).toSelf().inSingletonScope();
    bind(PreferenceTransaction).toSelf();
    bind(PreferenceTransactionFactory).toFactory(preferenceTransactionFactoryCreator);

    bind(CliPreferences).toDynamicValue(ctx => ServiceConnectionProvider.createProxy<CliPreferences>(ctx.container, CliPreferencesPath)).inSingletonScope();
    bind(PreferenceFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(PreferenceFrontendContribution);

    bind(WidgetStatusBarContribution).toConstantValue(noopWidgetStatusBarContribution(PreferencesWidget));
}

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bindPreferences(bind, unbind);
});
