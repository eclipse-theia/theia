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
import { WidgetFactory, createTreeContainer, TreeWidget, TreeProps, defaultTreeProps, TreeModel, LabelProviderContribution } from '@theia/core/lib/browser';
import { PreferenceNodeRendererFactory, PreferenceHeaderRenderer } from './components/preference-node-renderer';
import { PreferencesWidget } from './preference-widget';
import { PreferencesTreeWidget } from './preference-tree-widget';
import { PreferencesEditorWidget } from './preference-editor-widget';
import { PreferencesSearchbarWidget } from './preference-searchbar-widget';
import { PreferencesScopeTabBar } from './preference-scope-tabbar-widget';
import { PreferenceTreeModel } from '../preference-tree-model';
import { PreferenceTreeLabelProvider } from '../util/preference-tree-label-provider';
import { Preference } from '../util/preference-types';
import { PreferenceStringInputRenderer } from './components/preference-string-input';
import { PreferenceBooleanInputRenderer } from './components/preference-boolean-input';
import { PreferenceJSONLinkRenderer } from './components/preference-json-input';
import { PreferenceSelectInputRenderer } from './components/preference-select-input';
import { PreferenceNumberInputRenderer } from './components/preference-number-input';
import { PreferenceArrayInputRenderer } from './components/preference-array-input';

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
    bind(PreferenceSelectInputRenderer).toSelf();
    bind(PreferenceArrayInputRenderer).toSelf();
    bind(PreferenceStringInputRenderer).toSelf();
    bind(PreferenceBooleanInputRenderer).toSelf();
    bind(PreferenceNumberInputRenderer).toSelf();
    bind(PreferenceJSONLinkRenderer).toSelf();
    bind(PreferenceHeaderRenderer).toSelf();
}

function createPreferencesWidgetContainer(parent: interfaces.Container): Container {
    const child = createTreeContainer(parent);
    child.bind(PreferenceTreeModel).toSelf();
    child.rebind(TreeModel).toService(PreferenceTreeModel);
    child.unbind(TreeWidget);
    child.bind(PreferencesTreeWidget).toSelf();
    child.rebind(TreeProps).toConstantValue({ ...defaultTreeProps, search: false });
    child.bind(PreferencesEditorWidget).toSelf();

    child.bind(PreferencesSearchbarWidget).toSelf();
    child.bind(PreferencesScopeTabBar).toSelf();
    child.bind(PreferencesWidget).toSelf();

    child.bind(PreferenceNodeRendererFactory).toFactory(({ container }) => (node: Preference.TreeNode) => {
        const grandchild = container.createChild();
        grandchild.bind(Preference.Node).toConstantValue(node);
        if (Preference.LeafNode.is(node)) {
            if (node.preference.data.enum) {
                return grandchild.get(PreferenceSelectInputRenderer);
            }
            const type = Array.isArray(node.preference.data.type) ? node.preference.data.type[0] : node.preference.data.type;
            if (type === 'array' && node.preference.data.items?.type === 'string') {
                return grandchild.get(PreferenceArrayInputRenderer);
            }
            switch (type) {
                case 'string':
                    return grandchild.get(PreferenceStringInputRenderer);
                case 'boolean':
                    return grandchild.get(PreferenceBooleanInputRenderer);
                case 'number':
                case 'integer':
                    return grandchild.get(PreferenceNumberInputRenderer);
                default:
                    return grandchild.get(PreferenceJSONLinkRenderer);
            }
        } else {
            return grandchild.get(PreferenceHeaderRenderer);
        }
    });

    return child;
}
