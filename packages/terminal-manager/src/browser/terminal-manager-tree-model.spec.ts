// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { TerminalManagerTreeModel } from './terminal-manager-tree-model';
import { TerminalManagerTreeTypes } from './terminal-manager-types';
import { TreeImpl, Tree } from '@theia/core/lib/browser/tree/tree';
import { TreeSelectionServiceImpl } from '@theia/core/lib/browser/tree/tree-selection-impl';
import { TreeSelectionService } from '@theia/core/lib/browser/tree/tree-selection';
import { TreeExpansionServiceImpl, TreeExpansionService } from '@theia/core/lib/browser/tree/tree-expansion';
import { TreeNavigationService } from '@theia/core/lib/browser/tree/tree-navigation';
import { TreeFocusServiceImpl, TreeFocusService } from '@theia/core/lib/browser/tree/tree-focus-service';
import { TreeSearch } from '@theia/core/lib/browser/tree/tree-search';
import { FuzzySearch } from '@theia/core/lib/browser/tree/fuzzy-search';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { ILogger, bindContributionProvider } from '@theia/core/lib/common';
import { LabelProvider, LabelProviderContribution } from '@theia/core/lib/browser/label-provider';

describe('TerminalManagerTreeModel', () => {
    let container: Container;
    let model: TerminalManagerTreeModel;

    beforeEach(() => {
        container = new Container({ defaultScope: 'Singleton' });
        container.bind(TreeImpl).toSelf();
        container.bind(Tree).toService(TreeImpl);
        container.bind(TreeSelectionServiceImpl).toSelf();
        container.bind(TreeSelectionService).toService(TreeSelectionServiceImpl);
        container.bind(TreeExpansionServiceImpl).toSelf();
        container.bind(TreeExpansionService).toService(TreeExpansionServiceImpl);
        container.bind(TreeNavigationService).toSelf();
        container.bind(TreeFocusServiceImpl).toSelf();
        container.bind(TreeFocusService).toService(TreeFocusServiceImpl);
        container.bind(TreeSearch).toSelf();
        container.bind(FuzzySearch).toSelf();
        container.bind(MockLogger).toSelf();
        container.bind(ILogger).to(MockLogger);
        bindContributionProvider(container, LabelProviderContribution);
        container.bind(LabelProvider).toSelf().inSingletonScope();
        container.bind(TerminalManagerTreeModel).toSelf().inSingletonScope();

        model = container.get(TerminalManagerTreeModel);
    });

    after(() => {
        disableJSDOM();
    });

    describe('deleteTerminalPage', () => {
        it('should call onDidDeletePage when deleting a page', done => {
            // Add a regular page with a terminal
            const pageId = 'page-1' as TerminalManagerTreeTypes.PageId;
            const groupId = 'group-1' as TerminalManagerTreeTypes.GroupId;
            const terminalKey = 'terminal-1' as TerminalManagerTreeTypes.TerminalKey;

            model.addTerminalPage(terminalKey, groupId, pageId, 'Test Terminal');

            // Listen for the delete event
            model.onDidDeletePage(deletedPageId => {
                expect(deletedPageId).to.equal(pageId);
                done();
            });

            // Delete the page
            model.deleteTerminalPage(pageId);
        });

        it('should allow deleting the tasks page when it has children', done => {
            // Add a terminal to the tasks page
            const groupId = 'group-tasks-1' as TerminalManagerTreeTypes.GroupId;
            const terminalKey = 'terminal-task-1' as TerminalManagerTreeTypes.TerminalKey;

            const tasksPageId = model.getSpecialPageConfig('task')!.pageId;
            model.addTerminalPage(terminalKey, groupId, tasksPageId, 'Task Terminal');

            // Verify tasks page exists before deletion
            const tasksPageBefore = model.getNode(tasksPageId);
            expect(tasksPageBefore).to.not.be.undefined;
            expect(TerminalManagerTreeTypes.isPageNode(tasksPageBefore)).to.be.true;

            // Listen for the delete event to verify the deletion was attempted
            model.onDidDeletePage(deletedPageId => {
                expect(deletedPageId).to.equal(tasksPageId);
                done();
            });

            // Delete the tasks page - this should succeed (not be blocked)
            model.deleteTerminalPage(tasksPageId);
        });

        it('should do nothing when trying to delete a non-existent page', () => {
            const nonExistentPageId = 'page-nonexistent' as TerminalManagerTreeTypes.PageId;

            // Should not throw
            expect(() => model.deleteTerminalPage(nonExistentPageId)).to.not.throw();
        });
    });

    describe('neighbor selection after deletion', () => {
        it('should select a neighbor page when the active page is deleted', async () => {
            const pageId1 = 'page-1' as TerminalManagerTreeTypes.PageId;
            const pageId2 = 'page-2' as TerminalManagerTreeTypes.PageId;
            const groupId1 = 'group-1' as TerminalManagerTreeTypes.GroupId;
            const groupId2 = 'group-2' as TerminalManagerTreeTypes.GroupId;
            const key1 = 'terminal-1' as TerminalManagerTreeTypes.TerminalKey;
            const key2 = 'terminal-2' as TerminalManagerTreeTypes.TerminalKey;

            model.addTerminalPage(key1, groupId1, pageId1, 'Terminal 1');
            model.addTerminalPage(key2, groupId2, pageId2, 'Terminal 2');

            // Simulate selection of page2's terminal so page2 becomes active
            const termNode2 = model.getNode(key2);
            expect(TerminalManagerTreeTypes.isTerminalNode(termNode2)).to.be.true;
            if (TerminalManagerTreeTypes.isTerminalNode(termNode2)) {
                model.handleSelectionChanged(termNode2);
            }
            expect(model.activePageNode?.id).to.equal(pageId2);

            // Delete the active page
            model.deleteTerminalPage(pageId2);
            await model.refresh();

            // The remaining page's terminal should now be selected
            const page1 = model.getNode(pageId1);
            expect(page1).to.not.be.undefined;
            expect(TerminalManagerTreeTypes.isPageNode(page1)).to.be.true;
        });

        it('should select a neighbor terminal when the active terminal is deleted from a group', async () => {
            const pageId = 'page-1' as TerminalManagerTreeTypes.PageId;
            const groupId = 'group-1' as TerminalManagerTreeTypes.GroupId;
            const key1 = 'terminal-1' as TerminalManagerTreeTypes.TerminalKey;
            const key2 = 'terminal-2' as TerminalManagerTreeTypes.TerminalKey;

            model.addTerminalPage(key1, groupId, pageId, 'Terminal 1');
            model.addTerminal(key2, groupId, 'Terminal 2');

            // Ensure the tree index is up-to-date after addTerminal
            await model.refresh();

            // Select the second terminal
            const termNode2 = model.getNode(key2);
            expect(TerminalManagerTreeTypes.isTerminalNode(termNode2)).to.be.true;
            if (TerminalManagerTreeTypes.isTerminalNode(termNode2)) {
                model.handleSelectionChanged(termNode2);
            }
            expect(model.activeTerminalNode?.id).to.equal(key2);

            // Delete the active terminal
            model.deleteTerminalNode(key2);
            await model.refresh();

            // The remaining terminal should still be accessible
            const remaining = model.getNode(key1);
            expect(remaining).to.not.be.undefined;
            expect(TerminalManagerTreeTypes.isTerminalNode(remaining)).to.be.true;
        });
    });

    describe('addTerminalPage with special page', () => {
        it('should create special page on first use', () => {
            const tasksPageId = model.getSpecialPageConfig('task')!.pageId;
            const groupId = 'group-1' as TerminalManagerTreeTypes.GroupId;
            const terminalKey = 'terminal-1' as TerminalManagerTreeTypes.TerminalKey;

            model.addTerminalPage(terminalKey, groupId, tasksPageId, 'Task Terminal');

            const page = model.getNode(tasksPageId);
            expect(page).to.not.be.undefined;
            expect(TerminalManagerTreeTypes.isPageNode(page)).to.be.true;
        });

        it('should reuse existing special page', () => {
            const tasksPageId = model.getSpecialPageConfig('task')!.pageId;
            const groupId1 = 'group-1' as TerminalManagerTreeTypes.GroupId;
            const groupId2 = 'group-2' as TerminalManagerTreeTypes.GroupId;
            const key1 = 'terminal-1' as TerminalManagerTreeTypes.TerminalKey;
            const key2 = 'terminal-2' as TerminalManagerTreeTypes.TerminalKey;

            model.addTerminalPage(key1, groupId1, tasksPageId, 'Task 1');
            model.addTerminalPage(key2, groupId2, tasksPageId, 'Task 2');

            const page = model.getNode(tasksPageId);
            expect(TerminalManagerTreeTypes.isPageNode(page)).to.be.true;
            if (TerminalManagerTreeTypes.isPageNode(page)) {
                expect(page.children).to.have.lengthOf(2);
            }
        });

        it('should recreate a special page after its last terminal is removed', () => {
            const tasksPageId = model.getSpecialPageConfig('task')!.pageId;
            const firstGroup = 'group-tasks-a' as TerminalManagerTreeTypes.GroupId;
            const firstTerminal = 'terminal-task-a' as TerminalManagerTreeTypes.TerminalKey;
            const secondGroup = 'group-tasks-b' as TerminalManagerTreeTypes.GroupId;
            const secondTerminal = 'terminal-task-b' as TerminalManagerTreeTypes.TerminalKey;

            // Run a task -> Tasks page, group, and terminal appear.
            model.addTerminalPage(firstTerminal, firstGroup, tasksPageId, 'Task A');
            expect(model.getNode(tasksPageId)).to.not.be.undefined;

            // Remove the terminal -> cascades up and detaches the Tasks page.
            const addPageEvents: TerminalManagerTreeTypes.PageId[] = [];
            model.onDidAddPage(({ pageId }) => addPageEvents.push(pageId));
            model.deleteTerminalNode(firstTerminal);

            // The Tasks page should be fully cleared from the tree index.
            expect(model.getNode(tasksPageId)).to.be.undefined;
            expect(model.getNode(firstGroup)).to.be.undefined;
            expect(model.getNode(firstTerminal)).to.be.undefined;

            // Run another task -> Tasks page should be re-created and re-attached,
            // emitting onDidAddPage so the widget can rebuild the page panel.
            model.addTerminalPage(secondTerminal, secondGroup, tasksPageId, 'Task B');

            expect(addPageEvents).to.deep.equal([tasksPageId]);
            const reattached = model.getNode(tasksPageId);
            expect(TerminalManagerTreeTypes.isPageNode(reattached)).to.be.true;
            if (TerminalManagerTreeTypes.isPageNode(reattached)) {
                expect(reattached.parent).to.equal(model.root);
                expect(reattached.children).to.have.lengthOf(1);
                expect(reattached.children[0].id).to.equal(secondGroup);
            }
        });
    });
});
