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

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CompositeTreeNode, PreferenceSchemaProvider, SelectableTreeNode } from '@theia/core/lib/browser';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { Emitter } from '@theia/core';
import debounce = require('@theia/core/shared/lodash.debounce');

@injectable()
export class PreferenceTreeGenerator {

    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;
    @inject(PreferenceConfigurations) protected readonly preferenceConfigs: PreferenceConfigurations;

    protected readonly onSchemaChangedEmitter = new Emitter<CompositeTreeNode>();
    readonly onSchemaChanged = this.onSchemaChangedEmitter.event;

    @postConstruct()
    protected init(): void {
        this.schemaProvider.onDidPreferenceSchemaChanged(() => this.handleChangedSchema());
    }

    generateTree = (): CompositeTreeNode => {
        const preferencesSchema = this.schemaProvider.getCombinedSchema();
        const propertyNames = Object.keys(preferencesSchema.properties).sort((a, b) => a.localeCompare(b));
        const preferencesGroups: CompositeTreeNode[] = [];
        const groups = new Map<string, CompositeTreeNode>();
        const propertyPattern = Object.keys(preferencesSchema.patternProperties)[0]; // TODO: there may be a better way to get this data.
        const overridePropertyIdentifier = new RegExp(propertyPattern, 'i');

        const root = this.createRootNode(preferencesGroups);

        for (const propertyName of propertyNames) {
            if (!this.preferenceConfigs.isSectionName(propertyName) && !overridePropertyIdentifier.test(propertyName)) {
                const labels = propertyName.split('.');
                const group = labels[0];
                const subgroup = labels.length > 2 && labels.slice(0, 2).join('.');
                if (!groups.has(group)) {
                    const parentPreferencesGroup = this.createPreferencesGroup(group, root);
                    groups.set(group, parentPreferencesGroup);
                    preferencesGroups.push(parentPreferencesGroup);
                }
                if (subgroup && !groups.has(subgroup)) {
                    const remoteParent = groups.get(group) as CompositeTreeNode;
                    const newBranch = this.createPreferencesGroup(subgroup, remoteParent);
                    groups.set(subgroup, newBranch);
                    CompositeTreeNode.addChild(remoteParent, newBranch);
                }
                const parent = groups.get(subgroup || group) as CompositeTreeNode;
                const leafNode = this.createLeafNode(propertyName, parent);
                CompositeTreeNode.addChild(parent, leafNode);
            }
        }

        return root;
    };

    doHandleChangedSchema(): void {
        this.onSchemaChangedEmitter.fire(this.generateTree());
    }

    handleChangedSchema = debounce(this.doHandleChangedSchema, 200);

    protected createRootNode = (preferencesGroups: CompositeTreeNode[]): CompositeTreeNode => ({
        id: 'root-node-id',
        name: '',
        parent: undefined,
        visible: true,
        children: preferencesGroups
    });

    protected createLeafNode = (property: string, preferencesGroup: CompositeTreeNode): SelectableTreeNode => {
        const rawLeaf = property.split('.').pop();
        const name = this.formatString(rawLeaf!);
        return {
            id: property,
            name,
            parent: preferencesGroup,
            visible: true,
            selected: false,
        };
    };

    protected createPreferencesGroup = (group: string, root: CompositeTreeNode): CompositeTreeNode => {
        const isSubgroup = 'expanded' in root;
        const [groupname, subgroupname] = group.split('.');
        const label = isSubgroup ? subgroupname : groupname;
        const newNode = {
            id: group,
            name: this.toTitleCase(label),
            visible: true,
            parent: root,
            children: [],
            expanded: false,
            selected: false,
        };
        if (isSubgroup) {
            delete newNode.expanded;
        }
        return newNode;
    };

    protected toTitleCase(nonTitle: string): string {
        // Any non-word character or the 0-length space between a non-upper-case character and an upper-case character
        return this.split(nonTitle).map(word => this.capitalizeFirst(word)).join(' ').trim();
    }

    protected capitalizeFirst(maybeLowerCase: string): string {
        return maybeLowerCase.slice(0, 1).toLocaleUpperCase() + maybeLowerCase.slice(1);
    }

    /**
     * Split based on any non-word character or the 0-length space between a non-upper-case character and an upper-case character
     */
    private split(string: string): string[] {
        const split: string[] = [];
        const regex = /[A-Z]+[a-z0-9]*|[A-Z]*[a-z0-9]+/g;
        // eslint-disable-next-line no-null/no-null
        let match; while ((match = regex.exec(string)) !== null) {
            split.push(match[0]);
        }
        return split;
    }

    private formatString(string: string): string {
        const specifier = this.split(string);
        return specifier.map(word => word.slice(0, 1).toLocaleUpperCase() + word.slice(1)).join(' ').trim();
    }
}
