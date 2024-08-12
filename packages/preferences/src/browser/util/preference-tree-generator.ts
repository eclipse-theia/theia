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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CompositeTreeNode, PreferenceSchemaProvider, OVERRIDE_PROPERTY_PATTERN, PreferenceDataProperty } from '@theia/core/lib/browser';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { Emitter } from '@theia/core';
import debounce = require('@theia/core/shared/lodash.debounce');
import { Preference } from './preference-types';
import { COMMONLY_USED_SECTION_PREFIX, PreferenceLayoutProvider } from './preference-layout';

export interface CreatePreferencesGroupOptions {
    id: string,
    group: string,
    root: CompositeTreeNode,
    expanded?: boolean,
    depth?: number,
    label?: string
}

@injectable()
export class PreferenceTreeGenerator {

    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;
    @inject(PreferenceConfigurations) protected readonly preferenceConfigs: PreferenceConfigurations;
    @inject(PreferenceLayoutProvider) protected readonly layoutProvider: PreferenceLayoutProvider;

    protected _root: CompositeTreeNode;

    protected readonly onSchemaChangedEmitter = new Emitter<CompositeTreeNode>();
    readonly onSchemaChanged = this.onSchemaChangedEmitter.event;
    protected readonly defaultTopLevelCategory = 'extensions';

    get root(): CompositeTreeNode {
        return this._root ?? this.generateTree();
    }

    @postConstruct()
    protected init(): void {
        this.doInit();
    }

    protected async doInit(): Promise<void> {
        await this.schemaProvider.ready;
        this.schemaProvider.onDidPreferenceSchemaChanged(() => this.handleChangedSchema());
        this.handleChangedSchema();
    }

    generateTree(): CompositeTreeNode {
        const preferencesSchema = this.schemaProvider.getCombinedSchema();
        const propertyNames = Object.keys(preferencesSchema.properties);
        const groups = new Map<string, Preference.CompositeTreeNode>();
        const root = this.createRootNode();

        const commonlyUsedLayout = this.layoutProvider.getCommonlyUsedLayout();
        const commonlyUsed = this.getOrCreatePreferencesGroup({
            id: commonlyUsedLayout.id,
            group: commonlyUsedLayout.id,
            root,
            groups,
            label: commonlyUsedLayout.label
        });

        for (const layout of this.layoutProvider.getLayout()) {
            this.getOrCreatePreferencesGroup({
                id: layout.id,
                group: layout.id,
                root,
                groups,
                label: layout.label
            });
        }
        for (const preference of commonlyUsedLayout.settings ?? []) {
            if (preference in preferencesSchema.properties) {
                this.createLeafNode(preference, commonlyUsed, preferencesSchema.properties[preference]);
            }
        }
        for (const propertyName of propertyNames) {
            const property = preferencesSchema.properties[propertyName];
            if (!this.preferenceConfigs.isSectionName(propertyName) && !OVERRIDE_PROPERTY_PATTERN.test(propertyName) && !property.deprecationMessage) {
                if (property.owner) {
                    this.createPluginLeafNode(propertyName, property, root, groups);
                } else {
                    this.createBuiltinLeafNode(propertyName, property, root, groups);
                }
            }
        }

        for (const group of groups.values()) {
            if (group.id !== `${COMMONLY_USED_SECTION_PREFIX}@${COMMONLY_USED_SECTION_PREFIX}`) {
                (group.children as Preference.TreeNode[]).sort((a, b) => {
                    const aIsComposite = CompositeTreeNode.is(a);
                    const bIsComposite = CompositeTreeNode.is(b);
                    if (aIsComposite && !bIsComposite) {
                        return 1;
                    }
                    if (bIsComposite && !aIsComposite) {
                        return -1;
                    }
                    return a.id.localeCompare(b.id);
                });
            }
        }

        this._root = root;
        return root;
    };

    protected createBuiltinLeafNode(name: string, property: PreferenceDataProperty, root: CompositeTreeNode, groups: Map<string, Preference.CompositeTreeNode>): void {
        const layoutItem = this.layoutProvider.getLayoutForPreference(name);
        const labels = layoutItem ? layoutItem.id.split('.') : name.split('.');
        const groupID = this.getGroupName(labels);
        const subgroupName = this.getSubgroupName(labels, groupID);
        const subgroupID = [groupID, subgroupName].join('.');
        const toplevelParent = this.getOrCreatePreferencesGroup({
            id: groupID,
            group: groupID,
            root,
            groups
        });
        const immediateParent = subgroupName ? this.getOrCreatePreferencesGroup({
            id: subgroupID,
            group: groupID,
            root: toplevelParent,
            groups,
            label: layoutItem?.label
        }) : undefined;
        this.createLeafNode(name, immediateParent || toplevelParent, property);
    }

    protected createPluginLeafNode(name: string, property: PreferenceDataProperty, root: CompositeTreeNode, groups: Map<string, Preference.CompositeTreeNode>): void {
        if (!property.owner) {
            return;
        }
        const groupID = this.defaultTopLevelCategory;
        const subgroupName = property.owner;
        const subsubgroupName = property.group;
        const hasGroup = Boolean(subsubgroupName);
        const toplevelParent = this.getOrCreatePreferencesGroup({
            id: groupID,
            group: groupID,
            root,
            groups
        });
        const subgroupID = [groupID, subgroupName].join('.');
        const subgroupParent = this.getOrCreatePreferencesGroup({
            id: subgroupID,
            group: groupID,
            root: toplevelParent,
            groups,
            expanded: hasGroup,
            label: subgroupName
        });
        const subsubgroupID = [groupID, subgroupName, subsubgroupName].join('.');
        const subsubgroupParent = hasGroup ? this.getOrCreatePreferencesGroup({
            id: subsubgroupID,
            group: subgroupID,
            root: subgroupParent,
            groups,
            depth: 2,
            label: subsubgroupName
        }) : undefined;
        this.createLeafNode(name, subsubgroupParent || subgroupParent, property);
    }

    getNodeId(preferenceId: string): string {
        const expectedGroup = this.getGroupName(preferenceId.split('.'));
        const expectedId = `${expectedGroup}@${preferenceId}`;
        return expectedId;
    }

    protected getGroupName(labels: string[]): string {
        const defaultGroup = labels[0];
        if (this.layoutProvider.hasCategory(defaultGroup)) {
            return defaultGroup;
        }
        return this.defaultTopLevelCategory;
    }

    protected getSubgroupName(labels: string[], computedGroupName: string): string | undefined {
        if (computedGroupName !== labels[0]) {
            return labels[0];
        } else if (labels.length > 1) {
            return labels[1];
        } else {
            return undefined;
        }
    }

    doHandleChangedSchema(): void {
        const newTree = this.generateTree();
        this.onSchemaChangedEmitter.fire(newTree);
    }

    handleChangedSchema = debounce(this.doHandleChangedSchema, 200);

    protected createRootNode(): CompositeTreeNode {
        return {
            id: 'root-node-id',
            name: '',
            parent: undefined,
            visible: true,
            children: []
        };
    }

    protected createLeafNode(property: string, preferencesGroup: Preference.CompositeTreeNode, data: PreferenceDataProperty): Preference.LeafNode {
        const { group } = Preference.TreeNode.getGroupAndIdFromNodeId(preferencesGroup.id);
        const newNode: Preference.LeafNode = {
            id: `${group}@${property}`,
            preferenceId: property,
            parent: preferencesGroup,
            preference: { data },
            depth: Preference.TreeNode.isTopLevel(preferencesGroup) ? 1 : 2
        };
        CompositeTreeNode.addChild(preferencesGroup, newNode);
        return newNode;
    }

    protected createPreferencesGroup(options: CreatePreferencesGroupOptions): Preference.CompositeTreeNode {
        const newNode: Preference.CompositeTreeNode = {
            id: `${options.group}@${options.id}`,
            visible: true,
            parent: options.root,
            children: [],
            expanded: false,
            selected: false,
            depth: 0,
            label: options.label
        };
        const isTopLevel = Preference.TreeNode.isTopLevel(newNode);
        if (!(options.expanded ?? isTopLevel)) {
            delete newNode.expanded;
        }
        newNode.depth = options.depth ?? (isTopLevel ? 0 : 1);
        CompositeTreeNode.addChild(options.root, newNode);
        return newNode;
    }

    protected getOrCreatePreferencesGroup(options: CreatePreferencesGroupOptions & { groups: Map<string, Preference.CompositeTreeNode> }): Preference.CompositeTreeNode {
        const existingGroup = options.groups.get(options.id);
        if (existingGroup) { return existingGroup; }
        const newNode = this.createPreferencesGroup(options);
        options.groups.set(options.id, newNode);
        return newNode;
    };
}
