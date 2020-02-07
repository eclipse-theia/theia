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
import { interfaces } from 'inversify';
import { WidgetFactory, createTreeContainer, TreeWidget, TreeProps, defaultTreeProps, TreeDecoratorService } from '@theia/core/lib/browser';
import { SinglePreferenceDisplayFactory } from './components/single-preference-display-factory';
import { SinglePreferenceWrapper } from './components/single-preference-wrapper';
import { PreferencesWidget } from './preference-widget';
import { PreferencesTreeWidget } from './preference-tree-widget';
import { PreferencesEditorWidget } from './preference-editor-widget';
import { PreferencesSearchbarWidget } from './preference-searchbar-widget';
import { PreferencesScopeTabBar } from './preference-scope-tabbar-widget';
import { PreferencesDecorator } from '../preferences-decorator';
import { PreferencesDecoratorService } from '../preferences-decorator-service';

export function bindPreferencesWidgets(bind: interfaces.Bind): void {
    bind(PreferencesWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: PreferencesWidget.ID,
        createWidget: () => container.get(PreferencesWidget)
    })).inSingletonScope();

    bind(SinglePreferenceWrapper).toSelf();

    bind(PreferencesTreeWidget).toDynamicValue(ctx =>
        createPreferencesTree(ctx.container)
    ).inSingletonScope();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: PreferencesTreeWidget.ID,
        createWidget: (): PreferencesTreeWidget => context.container.get(PreferencesTreeWidget),
    })).inSingletonScope();

    bind(PreferencesEditorWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: PreferencesEditorWidget.ID,
        createWidget: (): PreferencesEditorWidget => context.container.get<PreferencesEditorWidget>(PreferencesEditorWidget),
    })).inSingletonScope();

    bind(PreferencesSearchbarWidget).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: PreferencesSearchbarWidget.ID,
        createWidget: (): PreferencesSearchbarWidget => context.container.get<PreferencesSearchbarWidget>(PreferencesSearchbarWidget),
    })).inSingletonScope();

    bind(PreferencesScopeTabBar).toSelf().inSingletonScope();
    bind(WidgetFactory).toDynamicValue(context => ({
        id: PreferencesScopeTabBar.ID,
        createWidget: (): PreferencesScopeTabBar => context.container.get<PreferencesScopeTabBar>(PreferencesScopeTabBar),
    })).inSingletonScope();

    bind(SinglePreferenceDisplayFactory).toSelf().inSingletonScope();
}

function createPreferencesTree(parent: interfaces.Container): PreferencesTreeWidget {
    const child = createTreeContainer(parent);
    child.unbind(TreeWidget);
    child.bind(PreferencesTreeWidget).toSelf();
    child.rebind(TreeProps).toConstantValue({ ...defaultTreeProps, search: false });

    bindPreferencesDecorator(child);

    return child.get(PreferencesTreeWidget);
}

function bindPreferencesDecorator(parent: interfaces.Container): void {
    parent.bind(PreferencesDecorator).toSelf().inSingletonScope();
    parent.bind(PreferencesDecoratorService).toSelf().inSingletonScope();
    parent.rebind(TreeDecoratorService).toService(PreferencesDecoratorService);
}
