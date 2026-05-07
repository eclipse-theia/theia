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
import { TerminalManagerTreeTypes, TASKS_PAGE_ID } from './terminal-manager-types';
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

            model.addTerminalToTasksPage(terminalKey, groupId, 'Task Terminal');

            // Verify tasks page exists before deletion
            const tasksPageBefore = model.getNode(TASKS_PAGE_ID);
            expect(tasksPageBefore).to.not.be.undefined;
            expect(TerminalManagerTreeTypes.isPageNode(tasksPageBefore)).to.be.true;

            // Listen for the delete event to verify the deletion was attempted
            model.onDidDeletePage(deletedPageId => {
                expect(deletedPageId).to.equal(TASKS_PAGE_ID);
                done();
            });

            // Delete the tasks page - this should succeed (not be blocked)
            model.deleteTerminalPage(TASKS_PAGE_ID);
        });

        it('should do nothing when trying to delete a non-existent page', () => {
            const nonExistentPageId = 'page-nonexistent' as TerminalManagerTreeTypes.PageId;

            // Should not throw
            expect(() => model.deleteTerminalPage(nonExistentPageId)).to.not.throw();
        });
    });

    describe('getOrCreateTasksPage', () => {
        it('should create tasks page if it does not exist', () => {
            const result = model.getOrCreateTasksPage();

            expect(result.isNewlyCreated).to.be.true;
            expect(result.page.id).to.equal(TASKS_PAGE_ID);
            expect(TerminalManagerTreeTypes.isPageNode(result.page)).to.be.true;
        });

        it('should return existing tasks page if it already exists', () => {
            // Create tasks page
            const first = model.getOrCreateTasksPage();
            expect(first.isNewlyCreated).to.be.true;

            // Try to get it again
            const second = model.getOrCreateTasksPage();
            expect(second.isNewlyCreated).to.be.false;
            expect(second.page.id).to.equal(first.page.id);
        });
    });
});
