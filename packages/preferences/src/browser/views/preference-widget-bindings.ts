/********************************************************************************
 * Copyright (C) 2020 Ericsson and others.
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
import { interfaces, Container } from '@theia/core/shared/inversify';
import { WidgetFactory, createTreeContainer, TreeWidget, TreeProps, defaultTreeProps, TreeDecoratorService, TreeModel } from '@theia/core/lib/browser';
import { SinglePreferenceDisplayFactory } from './components/single-preference-display-factory';
import { SinglePreferenceWrapper } from './components/single-preference-wrapper';
import { PreferencesWidget } from './preference-widget';
import { PreferencesTreeWidget } from './preference-tree-widget';
import { PreferencesEditorWidget } from './preference-editor-widget';
import { PreferencesSearchbarWidget } from './preference-searchbar-widget';
import { PreferencesScopeTabBar } from './preference-scope-tabbar-widget';
import { PreferencesDecorator } from '../preferences-decorator';
import { PreferencesDecoratorService } from '../preferences-decorator-service';
import { PreferenceTreeModel } from '../preference-tree-model';

export function bindPreferencesWidgets(bind: interfaces.Bind): void {
    bind(PreferencesWidget)
        .toDynamicValue(({ container }) => createPreferencesWidgetContainer(container).get(PreferencesWidget))
        .inSingletonScope();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: PreferencesWidget.ID,
        createWidget: () => container.get(PreferencesWidget)
    })).inSingletonScope();
}

function createPreferencesWidgetContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);
    child.bind(PreferenceTreeModel).toSelf();
    child.rebind(TreeModel).toService(PreferenceTreeModel);
    child.unbind(TreeWidget);
    child.bind(PreferencesTreeWidget).toSelf();
    child.rebind(TreeProps).toConstantValue({ ...defaultTreeProps, search: false });
    child.bind(PreferencesEditorWidget).toSelf();
    child.bind(PreferencesDecorator).toSelf();
    child.bind(PreferencesDecoratorService).toSelf();
    child.rebind(TreeDecoratorService).toService(PreferencesDecoratorService);

    child.bind(SinglePreferenceWrapper).toSelf();
    child.bind(PreferencesSearchbarWidget).toSelf();
    child.bind(PreferencesScopeTabBar).toSelf();
    child.bind(SinglePreferenceDisplayFactory).toSelf();
    child.bind(PreferencesWidget).toSelf();

    return child;
}
