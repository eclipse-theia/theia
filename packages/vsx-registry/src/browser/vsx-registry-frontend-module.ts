/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { ContainerModule } from '@theia/core/shared/inversify';
import { WidgetFactory, bindViewContribution, FrontendApplicationContribution, ViewContainerIdentifier, OpenHandler, WidgetManager } from '@theia/core/lib/browser';
import { VSXExtensionsViewContainer } from './vsx-extensions-view-container';
import { VSXExtensionsContribution } from './vsx-extensions-contribution';
import { VSXExtensionsSearchBar } from './vsx-extensions-search-bar';
import { VSXRegistryAPI } from '../common/vsx-registry-api';
import { VSXExtensionsModel } from './vsx-extensions-model';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { VSXExtensionsWidget, VSXExtensionsWidgetOptions } from './vsx-extensions-widget';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { VSXExtensionFactory, VSXExtension, VSXExtensionOptions } from './vsx-extension';
import { VSXExtensionEditor } from './vsx-extension-editor';
import { VSXExtensionEditorManager } from './vsx-extension-editor-manager';
import { VSXExtensionsSourceOptions } from './vsx-extensions-source';
import { VSXEnvironment } from '../common/vsx-environment';
import { VSXExtensionsSearchModel } from './vsx-extensions-search-model';
import { VSXApiVersionProviderImpl } from './vsx-api-version-provider-frontend-impl';
import { VSXApiVersionProvider } from '../common/vsx-api-version-provider';

export default new ContainerModule(bind => {
    bind(VSXEnvironment).toSelf().inRequestScope();
    bind(VSXRegistryAPI).toSelf().inSingletonScope();

    bind(VSXExtension).toSelf();
    bind(VSXExtensionFactory).toFactory(ctx => (option: VSXExtensionOptions) => {
        const child = ctx.container.createChild();
        child.bind(VSXExtensionOptions).toConstantValue(option);
        return child.get(VSXExtension);
    });
    bind(VSXExtensionsModel).toSelf().inSingletonScope();

    bind(VSXExtensionEditor).toSelf();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: VSXExtensionEditor.ID,
        createWidget: async (options: VSXExtensionOptions) => {
            const extension = await ctx.container.get(VSXExtensionsModel).resolve(options.id);
            const child = ctx.container.createChild();
            child.bind(VSXExtension).toConstantValue(extension);
            return child.get(VSXExtensionEditor);
        }
    })).inSingletonScope();
    bind(VSXExtensionEditorManager).toSelf().inSingletonScope();
    bind(OpenHandler).toService(VSXExtensionEditorManager);

    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: VSXExtensionsWidget.ID,
        createWidget: async (options: VSXExtensionsWidgetOptions) => VSXExtensionsWidget.createWidget(container, options)
    })).inSingletonScope();
    bind(WidgetFactory).toDynamicValue(ctx => ({
        id: VSXExtensionsViewContainer.ID,
        createWidget: async () => {
            const child = ctx.container.createChild();
            child.bind(ViewContainerIdentifier).toConstantValue({
                id: VSXExtensionsViewContainer.ID,
                progressLocationId: 'extensions'
            });
            child.bind(VSXExtensionsViewContainer).toSelf();
            const viewContainer = child.get(VSXExtensionsViewContainer);
            const widgetManager = child.get(WidgetManager);
            for (const id of [VSXExtensionsSourceOptions.SEARCH_RESULT, VSXExtensionsSourceOptions.INSTALLED, VSXExtensionsSourceOptions.BUILT_IN]) {
                const widget = await widgetManager.getOrCreateWidget(VSXExtensionsWidget.ID, { id });
                viewContainer.addWidget(widget, {
                    initiallyCollapsed: id === VSXExtensionsSourceOptions.BUILT_IN
                });
            }
            return viewContainer;
        }
    })).inSingletonScope();

    bind(VSXExtensionsSearchModel).toSelf().inSingletonScope();
    bind(VSXExtensionsSearchBar).toSelf().inSingletonScope();

    bindViewContribution(bind, VSXExtensionsContribution);
    bind(FrontendApplicationContribution).toService(VSXExtensionsContribution);
    bind(ColorContribution).toService(VSXExtensionsContribution);
    bind(TabBarToolbarContribution).toService(VSXExtensionsContribution);

    bind(VSXApiVersionProviderImpl).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(VSXApiVersionProviderImpl);
    bind(VSXApiVersionProvider).toService(VSXApiVersionProviderImpl);
});
