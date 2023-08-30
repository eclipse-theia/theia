// *****************************************************************************
// Copyright (C) 2020 Ericsson and others.
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
import { createTreeContainer, LabelProviderContribution, WidgetFactory } from '@theia/core/lib/browser';
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { Container, interfaces } from '@theia/core/shared/inversify';
import { PreferenceTreeModel } from '../preference-tree-model';
import { PreferenceTreeLabelProvider } from '../util/preference-tree-label-provider';
import { Preference } from '../util/preference-types';
import { PreferenceArrayInputRenderer, PreferenceArrayInputRendererContribution } from './components/preference-array-input';
import { PreferenceBooleanInputRenderer, PreferenceBooleanInputRendererContribution } from './components/preference-boolean-input';
import { PreferenceSingleFilePathInputRenderer, PreferenceSingleFilePathInputRendererContribution } from './components/preference-file-input';
import { PreferenceJSONLinkRenderer, PreferenceJSONLinkRendererContribution } from './components/preference-json-input';
import { PreferenceHeaderRenderer, PreferenceNodeRendererFactory } from './components/preference-node-renderer';
import {
    DefaultPreferenceNodeRendererCreatorRegistry, PreferenceHeaderRendererContribution, PreferenceNodeRendererContribution, PreferenceNodeRendererCreatorRegistry
} from './components/preference-node-renderer-creator';
import { PreferenceNumberInputRenderer, PreferenceNumberInputRendererContribution } from './components/preference-number-input';
import { PreferenceSelectInputRenderer, PreferenceSelectInputRendererContribution } from './components/preference-select-input';
import { PreferenceStringInputRenderer, PreferenceStringInputRendererContribution } from './components/preference-string-input';
import { PreferenceMarkdownRenderer } from './components/preference-markdown-renderer';
import { PreferencesEditorWidget } from './preference-editor-widget';
import { PreferencesScopeTabBar } from './preference-scope-tabbar-widget';
import { PreferencesSearchbarWidget } from './preference-searchbar-widget';
import { PreferencesTreeWidget } from './preference-tree-widget';
import { PreferencesWidget } from './preference-widget';

export function bindPreferencesWidgets(bind: interfaces.Bind): void {
    bind(PreferenceTreeLabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).toService(PreferenceTreeLabelProvider);
    bind(PreferencesWidget)
        .toDynamicValue(({ container }) => createPreferencesWidgetContainer(container).get(PreferencesWidget))
        .inSingletonScope();
    bind(WidgetFactory).toDynamicValue(({ container }) => ({
        id: PreferencesWidget.ID,
        createWidget: () => container.get(PreferencesWidget)
    })).inSingletonScope();

    bindContributionProvider(bind, PreferenceNodeRendererContribution);

    bind(PreferenceSelectInputRenderer).toSelf();
    bind(PreferenceNodeRendererContribution).to(PreferenceSelectInputRendererContribution).inSingletonScope();

    bind(PreferenceArrayInputRenderer).toSelf();
    bind(PreferenceNodeRendererContribution).to(PreferenceArrayInputRendererContribution).inSingletonScope();

    bind(PreferenceStringInputRenderer).toSelf();
    bind(PreferenceNodeRendererContribution).to(PreferenceStringInputRendererContribution).inSingletonScope();

    bind(PreferenceBooleanInputRenderer).toSelf();
    bind(PreferenceNodeRendererContribution).to(PreferenceBooleanInputRendererContribution).inSingletonScope();

    bind(PreferenceNumberInputRenderer).toSelf();
    bind(PreferenceNodeRendererContribution).to(PreferenceNumberInputRendererContribution).inSingletonScope();

    bind(PreferenceJSONLinkRenderer).toSelf();
    bind(PreferenceNodeRendererContribution).to(PreferenceJSONLinkRendererContribution).inSingletonScope();

    bind(PreferenceHeaderRenderer).toSelf();
    bind(PreferenceNodeRendererContribution).to(PreferenceHeaderRendererContribution).inSingletonScope();

    bind(PreferenceSingleFilePathInputRenderer).toSelf();
    bind(PreferenceNodeRendererContribution).to(PreferenceSingleFilePathInputRendererContribution).inSingletonScope();

    bind(DefaultPreferenceNodeRendererCreatorRegistry).toSelf().inSingletonScope();
    bind(PreferenceNodeRendererCreatorRegistry).toService(DefaultPreferenceNodeRendererCreatorRegistry);
}

export function createPreferencesWidgetContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent, {
        model: PreferenceTreeModel,
        widget: PreferencesTreeWidget,
        props: { search: false }
    });
    child.bind(PreferencesEditorWidget).toSelf();

    child.bind(PreferencesSearchbarWidget).toSelf();
    child.bind(PreferencesScopeTabBar).toSelf();
    child.bind(PreferencesWidget).toSelf();

    child.bind(PreferenceNodeRendererFactory).toFactory(({ container }) => (node: Preference.TreeNode) => {
        const registry = container.get<PreferenceNodeRendererCreatorRegistry>(PreferenceNodeRendererCreatorRegistry);
        const creator = registry.getPreferenceNodeRendererCreator(node);
        return creator.createRenderer(node, container);
    });

    child.bind(PreferenceMarkdownRenderer).toSelf().inSingletonScope();

    return child;
}
