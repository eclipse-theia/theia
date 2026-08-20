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

import { GettingStartedContribution } from './getting-started-contribution';
import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { GettingStartedWidget } from './getting-started-widget';
import { WidgetFactory, FrontendApplicationContribution, bindViewContribution, noopWidgetStatusBarContribution, WidgetStatusBarContribution } from '@theia/core/lib/browser';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { bindGettingStartedPreferences } from '../common/getting-started-preferences';
import { WalkthroughPluginSupport, WalkthroughService, WalkthroughViewEventSource } from './walkthrough-service';
import { HostedPluginSupport } from '@theia/plugin-ext/lib/hosted/browser/hosted-plugin';
import { PluginViewRegistry } from '@theia/plugin-ext/lib/main/browser/view/plugin-view-registry';
import '../../src/browser/style/index.css';

export default new ContainerModule((bind: interfaces.Bind) => {
    bindViewContribution(bind, GettingStartedContribution);
    bind(FrontendApplicationContribution).toService(GettingStartedContribution);
    bind(ColorContribution).toService(GettingStartedContribution);
    bind(WidgetStatusBarContribution).toConstantValue(noopWidgetStatusBarContribution(GettingStartedWidget));
    bind(GettingStartedWidget).toSelf();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: GettingStartedWidget.ID,
        createWidget: () => context.container.get<GettingStartedWidget>(GettingStartedWidget),
    })).inSingletonScope();
    bind(WalkthroughService).toSelf().inSingletonScope();
    bind(WalkthroughPluginSupport).toService(HostedPluginSupport);
    bind(WalkthroughViewEventSource).toService(PluginViewRegistry);
    bindGettingStartedPreferences(bind);
});
