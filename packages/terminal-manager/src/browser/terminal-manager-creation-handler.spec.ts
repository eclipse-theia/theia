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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { WidgetOpenerOptions } from '@theia/core/lib/browser';
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
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalManagerCreationHandler } from './terminal-manager-creation-handler';
import { TerminalManagerTreeModel } from './terminal-manager-tree-model';
import { TerminalManagerTreeTypes } from './terminal-manager-types';
import { TerminalManagerWidget } from './terminal-manager-widget';

disableJSDOM();

class TestTerminalManagerCreationHandler extends TerminalManagerCreationHandler {
    override getSplitGroupId(
        managerWidget: TerminalManagerWidget, terminal: TerminalWidget, options?: WidgetOpenerOptions
    ): TerminalManagerTreeTypes.GroupId | undefined {
        return super.getSplitGroupId(managerWidget, terminal, options);
    }
}

describe('TerminalManagerCreationHandler', () => {
    const pageId = 'page-1' as TerminalManagerTreeTypes.PageId;
    const firstGroupId = 'group-1' as TerminalManagerTreeTypes.GroupId;
    const secondGroupId = 'group-2' as TerminalManagerTreeTypes.GroupId;
    const firstTerminalKey = 'terminal-1' as TerminalManagerTreeTypes.TerminalKey;
    const secondTerminalKey = 'terminal-2' as TerminalManagerTreeTypes.TerminalKey;

    let toTearDown: () => void;
    let handler: TestTerminalManagerCreationHandler;
    let managerWidget: TerminalManagerWidget;

    const createTerminal = (id: string, location?: TerminalWidget['location']): TerminalWidget => ({ id, location } as unknown as TerminalWidget);

    before(() => {
        toTearDown = enableJSDOM();
    });

    after(() => {
        toTearDown();
    });

    beforeEach(async () => {
        const container = new Container({ defaultScope: 'Singleton' });
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
        const model = container.get(TerminalManagerTreeModel);

        // one page with two groups, the second one being active
        model.addTerminalPage(firstTerminalKey, firstGroupId, pageId, 'Terminal 1');
        model.addTerminalGroup(secondTerminalKey, secondGroupId, pageId, 'Terminal 2');
        await model.refresh();
        const secondTerminalNode = model.getNode(secondTerminalKey);
        expect(TerminalManagerTreeTypes.isTerminalNode(secondTerminalNode)).to.be.true;
        model.handleSelectionChanged(secondTerminalNode as TerminalManagerTreeTypes.TerminalNode);

        managerWidget = {
            terminalWidgetIdsToNodeIds: new Map([
                ['widget-1', firstTerminalKey],
                ['widget-2', secondTerminalKey],
            ]),
            treeWidget: { model },
        } as unknown as TerminalManagerWidget;
        handler = new TestTerminalManagerCreationHandler();
    });

    it('should use the group of the parent terminal given by the location', () => {
        const terminal = createTerminal('new-widget', { parentTerminal: 'widget-1' });
        expect(handler.getSplitGroupId(managerWidget, terminal)).to.equal(firstGroupId);
    });

    it('should use the group of the reference terminal of a split mode', () => {
        const options: WidgetOpenerOptions = { widgetOptions: { mode: 'split-right', ref: createTerminal('widget-1') } };
        expect(handler.getSplitGroupId(managerWidget, createTerminal('new-widget'), options)).to.equal(firstGroupId);
    });

    it('should fall back to the active group if the parent terminal is not managed', () => {
        const terminal = createTerminal('new-widget', { parentTerminal: 'unknown-widget' });
        expect(handler.getSplitGroupId(managerWidget, terminal)).to.equal(secondGroupId);
    });

    it('should fall back to the active group for a split mode without reference', () => {
        const options: WidgetOpenerOptions = { widgetOptions: { mode: 'split-bottom' } };
        expect(handler.getSplitGroupId(managerWidget, createTerminal('new-widget'), options)).to.equal(secondGroupId);
    });

    it('should not split for other modes', () => {
        const options: WidgetOpenerOptions = { widgetOptions: { mode: 'tab-after', ref: createTerminal('widget-1') } };
        expect(handler.getSplitGroupId(managerWidget, createTerminal('new-widget'), options)).to.be.undefined;
    });

    it('should not split without location or options', () => {
        expect(handler.getSplitGroupId(managerWidget, createTerminal('new-widget'))).to.be.undefined;
    });
});
