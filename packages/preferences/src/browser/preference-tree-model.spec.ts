// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { Emitter, ILogger, PreferenceSchemaService, PreferenceService } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { CompositeTreeNode, createTreeContainer, LabelProvider } from '@theia/core/lib/browser';
import { PreferenceTreeModel } from './preference-tree-model';
import { PreferencesSearchbarWidget } from './views/preference-searchbar-widget';
import { PreferenceTreeGenerator } from './util/preference-tree-generator';
import { PreferencesScopeTabBar } from './views/preference-scope-tabbar-widget';
import { Preference } from './util/preference-types';
import { COMMONLY_USED_SECTION_PREFIX } from './util/preference-layout';

disableJSDOM();

interface TreeFixture {
    root: CompositeTreeNode;
    commonlyUsed?: Preference.CompositeTreeNode;
    editor: Preference.CompositeTreeNode;
    editorCursor: Preference.CompositeTreeNode;
    extensions: Preference.CompositeTreeNode;
}

describe('PreferenceTreeModel', () => {

    let searchbarEmitter: Emitter<string>;
    let schemaEmitter: Emitter<CompositeTreeNode>;

    function createComposite(group: string, id: string, parent: CompositeTreeNode, depth: number, expandable: boolean): Preference.CompositeTreeNode {
        const node: Preference.CompositeTreeNode = {
            id: `${group}@${id}`,
            visible: true,
            parent,
            children: [],
            expanded: false,
            selected: false,
            depth,
            label: id,
        } as Preference.CompositeTreeNode;
        if (!expandable) {
            delete node.expanded;
        }
        CompositeTreeNode.addChild(parent, node);
        return node;
    }

    function createLeaf(group: string, preferenceId: string, parent: Preference.CompositeTreeNode, depth: number): Preference.LeafNode {
        const node: Preference.LeafNode = {
            id: `${group}@${preferenceId}`,
            preferenceId,
            parent,
            preference: { data: {} },
            depth,
        };
        CompositeTreeNode.addChild(parent, node);
        return node;
    }

    function createFixture(withCommonlyUsed: boolean = true): TreeFixture {
        const root: CompositeTreeNode = {
            id: 'root-node-id',
            name: '',
            parent: undefined,
            visible: true,
            children: [],
        };
        let commonlyUsed: Preference.CompositeTreeNode | undefined;
        if (withCommonlyUsed) {
            commonlyUsed = createComposite(COMMONLY_USED_SECTION_PREFIX, COMMONLY_USED_SECTION_PREFIX, root, 0, true);
            createLeaf(COMMONLY_USED_SECTION_PREFIX, 'files.autoSave', commonlyUsed, 1);
        }
        const editor = createComposite('editor', 'editor', root, 0, true);
        createLeaf('editor', 'editor.fontSize', editor, 1);
        const editorCursor = createComposite('editor', 'editor.cursor', editor, 1, false);
        createLeaf('editor', 'editor.cursorStyle', editorCursor, 2);
        const extensions = createComposite('extensions', 'extensions', root, 0, true);
        createLeaf('extensions', 'extensions.autoUpdate', extensions, 1);
        return { root, commonlyUsed, editor, editorCursor, extensions };
    }

    /**
     * Creates the model. The `onCreated` callback runs after the tree model's listeners are
     * registered but before the (async) initial schema is applied, which simulates state that
     * is restored before initialization completes, e.g. a restored search term.
     */
    async function createModel(fixture: TreeFixture, onCreated?: (model: PreferenceTreeModel) => void): Promise<PreferenceTreeModel> {
        const parent = new Container();
        searchbarEmitter = new Emitter<string>();
        schemaEmitter = new Emitter<CompositeTreeNode>();
        parent.bind(ILogger).to(MockLogger).inSingletonScope();
        parent.bind(LabelProvider).toConstantValue({
            getName: () => '',
            getIcon: () => '',
            getLongName: () => '',
        } as any);
        parent.bind(PreferenceSchemaService).toConstantValue({
            getSchemaProperties: () => new Map(),
            isValidInScope: () => true,
        } as any);
        parent.bind(PreferenceService).toConstantValue({
            ready: Promise.resolve(),
        } as any);
        parent.bind(PreferencesSearchbarWidget).toConstantValue({
            onFilterChanged: searchbarEmitter.event,
            updateResultsCount: () => { },
        } as any);
        parent.bind(PreferenceTreeGenerator).toConstantValue({
            onSchemaChanged: schemaEmitter.event,
            root: fixture.root,
            getNodeId: () => '',
        } as any);
        parent.bind(PreferencesScopeTabBar).toConstantValue({
            onScopeChanged: new Emitter().event,
            currentScope: Preference.DEFAULT_SCOPE,
        } as any);
        const child = createTreeContainer(parent, { model: PreferenceTreeModel });
        const model = child.get(PreferenceTreeModel);
        onCreated?.(model);
        await new Promise(resolve => setTimeout(resolve));
        return model;
    }

    describe('category filter', () => {

        it('selects the Commonly Used category by default', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            expect(model.selectedNodes[0]?.id).to.equal(fixture.commonlyUsed!.id);
            expect(model.categoryFilterId).to.equal(fixture.commonlyUsed!.id);
        });

        it('applies the category filter when a category is selected', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            model.selectNode(fixture.extensions);
            expect(model.categoryFilterId).to.equal(fixture.extensions.id);
        });

        it('keeps the user selection across schema reloads', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            model.selectNode(fixture.extensions);
            schemaEmitter.fire(fixture.root);
            expect(model.selectedNodes[0]?.id).to.equal(fixture.extensions.id);
            expect(model.categoryFilterId).to.equal(fixture.extensions.id);
        });

        it('restores the user selection when the schema is rebuilt with new nodes', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            model.selectNode(fixture.extensions);
            const rebuilt = createFixture();
            schemaEmitter.fire(rebuilt.root);
            expect(model.selectedNodes[0]).to.equal(model.getNode(rebuilt.extensions.id));
            expect(model.selectedNodes[0]?.selected).to.be.true;
            expect(model.categoryFilterId).to.equal(rebuilt.extensions.id);
        });

        it('keeps the default selection highlighted when the schema is rebuilt with new nodes', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            const rebuilt = createFixture();
            schemaEmitter.fire(rebuilt.root);
            expect(model.selectedNodes[0]).to.equal(model.getNode(rebuilt.commonlyUsed!.id));
            expect(model.selectedNodes[0]?.selected).to.be.true;
        });

        it('preserves the category filter when restoring a synced selection after a schema rebuild', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            model.selectNode(fixture.editor);
            model.selectIfNotSelected(fixture.editorCursor);
            const rebuilt = createFixture();
            schemaEmitter.fire(rebuilt.root);
            expect(model.selectedNodes[0]).to.equal(model.getNode(rebuilt.editorCursor.id));
            expect(model.selectedNodes[0]?.selected).to.be.true;
            expect(model.categoryFilterId).to.equal(rebuilt.editor.id);
        });

        it('falls back to the default category when the selected category disappears from the schema', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            model.selectNode(fixture.extensions);
            const newFixture = createFixture();
            newFixture.root.children = newFixture.root.children.filter(child => child !== newFixture.extensions);
            schemaEmitter.fire(newFixture.root);
            expect(model.selectedNodes[0]).to.equal(model.getNode(newFixture.commonlyUsed!.id));
            expect(model.categoryFilterId).to.equal(newFixture.commonlyUsed!.id);
        });
    });

    describe('editor scroll sync', () => {

        it('does not change the category filter when the selection syncs to the editor scroll position', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            model.selectNode(fixture.editor);
            model.selectIfNotSelected(fixture.editorCursor);
            expect(model.selectedNodes[0]?.id).to.equal(fixture.editorCursor.id);
            expect(model.categoryFilterId).to.equal(fixture.editor.id);
        });

        it('does not narrow active search results when the selection syncs to the editor scroll position', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            searchbarEmitter.fire('font');
            model.selectIfNotSelected(fixture.editor);
            expect(model.categoryFilterId).to.be.undefined;
        });
    });

    describe('search interaction', () => {

        it('clears the category filter and the selection when a search starts', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            model.selectNode(fixture.editor);
            searchbarEmitter.fire('font');
            expect(model.isFiltered).to.be.true;
            expect(model.categoryFilterId).to.be.undefined;
            expect(model.selectedNodes).to.have.lengthOf(0);
        });

        it('applies the category filter when a category is explicitly selected during a search', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            searchbarEmitter.fire('font');
            model.selectNode(fixture.editor);
            expect(model.categoryFilterId).to.equal(fixture.editor.id);
        });

        it('resets to all results when the search term changes after a category was selected', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            searchbarEmitter.fire('font');
            model.selectNode(fixture.editor);
            searchbarEmitter.fire('fonts');
            expect(model.categoryFilterId).to.be.undefined;
            expect(model.selectedNodes).to.have.lengthOf(0);
        });

        it('returns to the Commonly Used category when the search is cleared', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture);
            searchbarEmitter.fire('font');
            model.selectNode(fixture.editor);
            searchbarEmitter.fire('');
            expect(model.selectedNodes[0]?.id).to.equal(fixture.commonlyUsed!.id);
            expect(model.categoryFilterId).to.equal(fixture.commonlyUsed!.id);
        });
    });

    describe('initial selection', () => {

        it('does not apply the default selection while a restored search is active', async () => {
            const fixture = createFixture();
            const model = await createModel(fixture, () => searchbarEmitter.fire('font'));
            expect(model.selectedNodes).to.have.lengthOf(0);
            expect(model.categoryFilterId).to.be.undefined;
            searchbarEmitter.fire('');
            expect(model.selectedNodes[0]?.id).to.equal(fixture.commonlyUsed!.id);
            expect(model.categoryFilterId).to.equal(fixture.commonlyUsed!.id);
        });

        it('applies the default selection on a later schema change if Commonly Used is not present initially', async () => {
            const withoutCommonlyUsed = createFixture(false);
            const model = await createModel(withoutCommonlyUsed);
            expect(model.selectedNodes).to.have.lengthOf(0);
            const withCommonlyUsed = createFixture();
            schemaEmitter.fire(withCommonlyUsed.root);
            expect(model.selectedNodes[0]?.id).to.equal(withCommonlyUsed.commonlyUsed!.id);
            expect(model.categoryFilterId).to.equal(withCommonlyUsed.commonlyUsed!.id);
        });
    });
});
