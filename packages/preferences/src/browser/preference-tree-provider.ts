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

import { inject, injectable, postConstruct } from 'inversify';
import * as fuzzy from 'fuzzy';
import { debounce } from 'lodash';
import { TreeNode, CompositeTreeNode, PreferenceSchemaProvider, PreferenceDataSchema, PreferenceDataProperty, PreferenceScope } from '@theia/core/lib/browser';
import { PreferenceConfigurations } from '@theia/core/lib/browser/preferences/preference-configurations';
import { PreferencesEventService } from './util/preference-event-service';
import { PreferenceTreeGenerator } from './util/preference-tree-generator';
import { Preference } from './util/preference-types';

interface PreferenceFilterOptions {
    minLength?: number;
    baseSchemaAltered?: boolean;
    requiresFilter?: boolean;
};

const filterDefaults: Required<PreferenceFilterOptions> = {
    minLength: 1,
    baseSchemaAltered: false,
    requiresFilter: true,
};

@injectable()
export class PreferencesTreeProvider {

    protected _isFiltered: boolean = false;
    protected lastSearchedLiteral: string = '';
    protected lastSearchedFuzzy: string = '';
    protected baseSchema: PreferenceDataSchema;
    protected baseTree: CompositeTreeNode;
    protected _currentTree: CompositeTreeNode;
    protected currentScope: Preference.SelectedScopeDetails = Preference.DEFAULT_SCOPE;
    protected handleUnderlyingDataChange = debounce(
        (options: PreferenceFilterOptions, newScope?: Preference.SelectedScopeDetails) => this.updateUnderlyingData(options, newScope),
        200
    );

    @inject(PreferencesEventService) protected readonly preferencesEventService: PreferencesEventService;
    @inject(PreferenceSchemaProvider) protected readonly schemaProvider: PreferenceSchemaProvider;
    @inject(PreferenceConfigurations) protected readonly preferenceConfigs: PreferenceConfigurations;
    @inject(PreferenceTreeGenerator) protected readonly preferencesTreeGenerator: PreferenceTreeGenerator;

    @postConstruct()
    protected init(): void {
        this.updateUnderlyingData({ baseSchemaAltered: true });
        this.schemaProvider.onDidPreferenceSchemaChanged(() => this.handleUnderlyingDataChange({ baseSchemaAltered: true }));
        this.preferencesEventService.onSearch.event(searchEvent => this.updateDisplay(searchEvent.query));
        this.preferencesEventService.onTabScopeSelected.event(scopeEvent => {
            const newScope = Number(scopeEvent.scope);
            const currentScope = Number(this.currentScope.scope);
            const scopeChangesPreferenceVisibility =
                ((newScope === PreferenceScope.User || newScope === PreferenceScope.Workspace) && currentScope === PreferenceScope.Folder)
                || (newScope === PreferenceScope.Folder && (currentScope === PreferenceScope.User || currentScope === PreferenceScope.Workspace));

            this.handleUnderlyingDataChange({ requiresFilter: scopeChangesPreferenceVisibility }, scopeEvent);
        });
    }

    protected updateUnderlyingData(options: PreferenceFilterOptions, newScope?: Preference.SelectedScopeDetails): void {
        if (options.baseSchemaAltered) {
            this.baseSchema = this.schemaProvider.getCombinedSchema();
        }
        if (newScope) {
            this.currentScope = newScope;
        }
        this.updateDisplay(this.lastSearchedLiteral, options);
    }

    protected updateDisplay(term: string = this.lastSearchedLiteral, options: PreferenceFilterOptions = {}): void {
        if (options.baseSchemaAltered) {
            this.baseTree = this.preferencesTreeGenerator.generateTree();
        }
        const shouldBuildNewTree = options.requiresFilter !== false;
        if (shouldBuildNewTree) {
            this._currentTree = this.filter(term, Number(this.currentScope.scope), this.baseTree, options);
        }

        this.preferencesEventService.onDisplayChanged.fire(shouldBuildNewTree || !!options.baseSchemaAltered);
    }

    protected filter<Tree extends TreeNode>(
        searchTerm: string,
        currentScope: PreferenceScope,
        tree: Tree,
        filterOptions: PreferenceFilterOptions = {},
    ): Tree {
        const { minLength } = { ...filterDefaults, ...filterOptions };

        this.lastSearchedLiteral = searchTerm;
        this.lastSearchedFuzzy = searchTerm.replace(/\s/g, '');
        this._isFiltered = searchTerm.length >= minLength;

        return this.recurseAndSetVisible(currentScope, tree);
    }

    protected recurseAndSetVisible<Tree extends TreeNode>(
        scope: PreferenceScope,
        tree: Tree,
    ): Tree {
        let currentNodeShouldBeVisible = false;

        if (CompositeTreeNode.is(tree)) {
            tree.children = tree.children.map(child => {
                const newChild = this.recurseAndSetVisible(scope, child);
                currentNodeShouldBeVisible = currentNodeShouldBeVisible || !!newChild.visible;
                return newChild;
            });
            if (Preference.Branch.is(tree)) {
                tree.leaves = (tree.leaves || []).map(child => {
                    const newChild = this.recurseAndSetVisible(scope, child);
                    currentNodeShouldBeVisible = currentNodeShouldBeVisible || !!newChild.visible;
                    return newChild;
                });
            }
        } else {
            currentNodeShouldBeVisible = this.schemaProvider.isValidInScope(tree.id, scope)
                && (
                    !this._isFiltered // search too short.
                    || fuzzy.test(this.lastSearchedFuzzy, tree.id || '') // search matches preference name.
                    // search matches description. Fuzzy isn't ideal here because the score depends on the order of discovery.
                    || (this.baseSchema.properties[tree.id].description || '').includes(this.lastSearchedLiteral)
                );
        }

        return { ...tree, visible: currentNodeShouldBeVisible };
    }

    get currentTree(): CompositeTreeNode {
        return this._currentTree;
    }

    get propertyList(): { [key: string]: PreferenceDataProperty; } {
        return this.baseSchema.properties;
    }

    get isFiltered(): boolean {
        return this._isFiltered;
    }

}
