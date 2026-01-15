// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { TreeModelImpl, CompositeTreeNode, SelectableTreeNode, DepthFirstTreeIterator, TreeNode } from '@theia/core/lib/browser';
import { Emitter, nls } from '@theia/core';
import { TerminalManagerTreeTypes } from './terminal-manager-types';

@injectable()
export class TerminalManagerTreeModel extends TreeModelImpl {
    activePageNode: TerminalManagerTreeTypes.PageNode | undefined;
    activeGroupNode: TerminalManagerTreeTypes.TerminalGroupNode | undefined;
    activeTerminalNode: TerminalManagerTreeTypes.TerminalNode | undefined;

    protected onDidChangeTreeSelectionEmitter = new Emitter<TerminalManagerTreeTypes.SelectionChangedEvent>();
    readonly onDidChangeTreeSelection = this.onDidChangeTreeSelectionEmitter.event;

    protected onDidAddPageEmitter = new Emitter<{ pageId: TerminalManagerTreeTypes.PageId, terminalKey: TerminalManagerTreeTypes.TerminalKey }>();
    readonly onDidAddPage = this.onDidAddPageEmitter.event;
    protected onDidDeletePageEmitter = new Emitter<TerminalManagerTreeTypes.PageId>();
    readonly onDidDeletePage = this.onDidDeletePageEmitter.event;

    protected onDidRenameNodeEmitter = new Emitter<TerminalManagerTreeTypes.TerminalManagerTreeNode>();
    readonly onDidRenameNode = this.onDidRenameNodeEmitter.event;

    protected onDidAddTerminalGroupEmitter = new Emitter<{
        groupId: TerminalManagerTreeTypes.GroupId,
        pageId: TerminalManagerTreeTypes.PageId,
        terminalKey: TerminalManagerTreeTypes.TerminalKey,
    }>();
    readonly onDidAddTerminalGroup = this.onDidAddTerminalGroupEmitter.event;

    protected onDidDeleteTerminalGroupEmitter = new Emitter<TerminalManagerTreeTypes.GroupId>();
    readonly onDidDeleteTerminalGroup = this.onDidDeleteTerminalGroupEmitter.event;

    protected onDidAddTerminalToGroupEmitter = new Emitter<{
        terminalId: TerminalManagerTreeTypes.TerminalKey,
        groupId: TerminalManagerTreeTypes.GroupId,
    }>();
    readonly onDidAddTerminalToGroup = this.onDidAddTerminalToGroupEmitter.event;

    protected onDidDeleteTerminalFromGroupEmitter = new Emitter<{
        terminalId: TerminalManagerTreeTypes.TerminalKey,
        groupId: TerminalManagerTreeTypes.GroupId,
    }>();
    readonly onDidDeleteTerminalFromGroup = this.onDidDeleteTerminalFromGroupEmitter.event;

    @postConstruct()
    protected override init(): void {
        super.init();
        this.toDispose.push(this.selectionService.onSelectionChanged(selectionEvent => {
            const selectedNode = selectionEvent.find(node => node.selected);
            if (selectedNode) {
                this.handleSelectionChanged(selectedNode);
            }
        }));
        this.root = { id: 'root', parent: undefined, children: [], visible: false } as CompositeTreeNode;
    }

    addTerminalPage(
        terminalKey: TerminalManagerTreeTypes.TerminalKey,
        groupId: TerminalManagerTreeTypes.GroupId,
        pageId: TerminalManagerTreeTypes.PageId,
    ): void {
        const pageNode = this.createPageNode(pageId);
        const groupNode = this.createGroupNode(groupId, pageId);
        const terminalNode = this.createTerminalNode(terminalKey, groupId);
        if (this.root && CompositeTreeNode.is(this.root)) {
            this.activePageNode = pageNode;
            CompositeTreeNode.addChild(groupNode, terminalNode);
            CompositeTreeNode.addChild(pageNode, groupNode);
            this.root = CompositeTreeNode.addChild(this.root, pageNode);
            this.onDidAddPageEmitter.fire({ pageId: pageNode.id, terminalKey });
            setTimeout(() => {
                this.selectionService.addSelection(terminalNode);
            });
        }
    }

    protected createPageNode(pageId: TerminalManagerTreeTypes.PageId): TerminalManagerTreeTypes.PageNode {
        const currentPageNumber = this.getNextPageCounter();
        return {
            id: pageId,
            label: `${nls.localize('theia/terminal-manager/page', 'Page')} (${currentPageNumber})`,
            parent: undefined,
            selected: false,
            children: [],
            page: true,
            isEditing: false,
            expanded: true,
            counter: currentPageNumber,
        };
    }

    protected getNextPageCounter(): number {
        return Math.max(0, ...Array.from(this.pages.values(), page => page.counter)) + 1;
    }

    deleteTerminalPage(pageId: TerminalManagerTreeTypes.PageId): void {
        const pageNode = this.getNode(pageId);
        if (TerminalManagerTreeTypes.isPageNode(pageNode) && CompositeTreeNode.is(this.root)) {
            const isActive = this.activePageNode === pageNode;
            this.onDidDeletePageEmitter.fire(pageNode.id);
            CompositeTreeNode.removeChild(this.root, pageNode);
            this.refreshWithSelection(this.root, undefined, isActive ? pageNode : undefined);
        }
    }

    addTerminalGroup(
        terminalKey: TerminalManagerTreeTypes.TerminalKey,
        groupId: TerminalManagerTreeTypes.GroupId,
        pageId: TerminalManagerTreeTypes.PageId,
    ): void {
        const groupNode = this.createGroupNode(groupId, pageId);
        const terminalNode = this.createTerminalNode(terminalKey, groupId);
        const pageNode = this.getNode(pageId);
        if (this.root && CompositeTreeNode.is(this.root) && TerminalManagerTreeTypes.isPageNode(pageNode)) {
            this.onDidAddTerminalGroupEmitter.fire({ groupId: groupNode.id, pageId, terminalKey });
            CompositeTreeNode.addChild(groupNode, terminalNode);
            CompositeTreeNode.addChild(pageNode, groupNode);
            this.refreshWithSelection(pageNode, terminalNode);
        }
    }

    protected createGroupNode(
        groupId: TerminalManagerTreeTypes.GroupId,
        pageId: TerminalManagerTreeTypes.PageId,
    ): TerminalManagerTreeTypes.TerminalGroupNode {
        const currentGroupNum = this.getNextGroupCounterForPage(pageId);
        return {
            id: groupId,
            label: `${nls.localize('theia/terminal-manager/group', 'Group')} (${currentGroupNum})`,
            parent: undefined,
            selected: false,
            children: [],
            terminalGroup: true,
            isEditing: false,
            parentPageId: pageId,
            expanded: true,
            counter: currentGroupNum,
        };
    }

    protected getNextGroupCounterForPage(pageId: TerminalManagerTreeTypes.PageId): number {
        const page = this.pages.get(pageId);
        if (page) {
            return Math.max(0, ...page.children.map(group => group.counter)) + 1;
        }
        return 1;
    }

    deleteTerminalGroup(groupId: TerminalManagerTreeTypes.GroupId): void {
        const groupNode = this.tree.getNode(groupId);
        const parentPageNode = groupNode?.parent;
        if (TerminalManagerTreeTypes.isGroupNode(groupNode) && TerminalManagerTreeTypes.isPageNode(parentPageNode)) {
            if (parentPageNode.children.length === 1) {
                this.deleteTerminalPage(parentPageNode.id);
            } else {
                const isActive = this.activeGroupNode === groupNode;
                this.doDeleteTerminalGroup(groupNode, parentPageNode);
                this.refreshWithSelection(parentPageNode, undefined, isActive ? groupNode : undefined);
            }
        }
    }

    protected doDeleteTerminalGroup(group: TerminalManagerTreeTypes.TerminalGroupNode, page: TerminalManagerTreeTypes.PageNode): void {
        this.onDidDeleteTerminalGroupEmitter.fire(group.id);
        CompositeTreeNode.removeChild(page, group);
    }

    addTerminal(newTerminalId: TerminalManagerTreeTypes.TerminalKey, groupId: TerminalManagerTreeTypes.GroupId): void {
        const groupNode = this.getNode(groupId);
        if (groupNode && TerminalManagerTreeTypes.isGroupNode(groupNode)) {
            const terminalNode = this.createTerminalNode(newTerminalId, groupId);
            CompositeTreeNode.addChild(groupNode, terminalNode);
            this.onDidAddTerminalToGroupEmitter.fire({ terminalId: newTerminalId, groupId });
            this.refreshWithSelection(undefined, terminalNode);
        }
    }

    createTerminalNode(
        terminalId: TerminalManagerTreeTypes.TerminalKey,
        groupId: TerminalManagerTreeTypes.GroupId,
    ): TerminalManagerTreeTypes.TerminalNode {
        return {
            id: terminalId,
            label: nls.localizeByDefault('Terminal'),
            parent: undefined,
            children: [],
            selected: false,
            terminal: true,
            isEditing: false,
            parentGroupId: groupId,
        };
    }

    deleteTerminalNode(terminalId: TerminalManagerTreeTypes.TerminalKey): void {
        const terminalNode = this.getNode(terminalId);
        const parentGroupNode = terminalNode?.parent;
        if (TerminalManagerTreeTypes.isTerminalNode(terminalNode) && TerminalManagerTreeTypes.isGroupNode(parentGroupNode)) {
            if (parentGroupNode.children.length === 1) {
                this.deleteTerminalGroup(parentGroupNode.id);
            } else {
                const isActive = this.activeTerminalNode === terminalNode;
                this.doDeleteTerminalNode(terminalNode, parentGroupNode);
                this.refreshWithSelection(parentGroupNode, undefined, isActive ? terminalNode : undefined);
            }
        }
    }

    protected doDeleteTerminalNode(node: TerminalManagerTreeTypes.TerminalNode, parent: TerminalManagerTreeTypes.TerminalGroupNode): void {
        this.onDidDeleteTerminalFromGroupEmitter.fire({
            terminalId: node.id,
            groupId: parent.id,
        });
        CompositeTreeNode.removeChild(parent, node);
    }

    toggleRenameTerminal(entityId: TerminalManagerTreeTypes.TerminalManagerValidId): void {
        const node = this.getNode(entityId);
        if (TerminalManagerTreeTypes.isTerminalManagerTreeNode(node)) {
            node.isEditing = true;
            this.fireChanged();
        }
    }

    acceptRename(nodeId: string, newName: string): void {
        const node = this.getNode(nodeId);
        if (TerminalManagerTreeTypes.isTerminalManagerTreeNode(node)) {
            const trimmedName = newName.trim();
            node.label = trimmedName === '' ? node.label : newName;
            node.isEditing = false;
            this.fireChanged();
            this.onDidRenameNodeEmitter.fire(node);
        }
    }

    handleSelectionChanged(selectedNode: SelectableTreeNode): void {
        let activeTerminal: TerminalManagerTreeTypes.TerminalNode | undefined = undefined;
        let activeGroup: TerminalManagerTreeTypes.TerminalGroupNode | undefined = undefined;
        let activePage: TerminalManagerTreeTypes.PageNode | undefined = undefined;
        if (TerminalManagerTreeTypes.isTerminalNode(selectedNode)) {
            activeTerminal = selectedNode;
            const { parent } = activeTerminal;
            if (TerminalManagerTreeTypes.isGroupNode(parent)) {
                activeGroup = parent;
                const grandparent = activeGroup.parent;
                if (TerminalManagerTreeTypes.isPageNode(grandparent)) {
                    activePage = grandparent;
                }
            } else if (TerminalManagerTreeTypes.isPageNode(parent)) {
                activePage = parent;
            }
        } else if (TerminalManagerTreeTypes.isGroupNode(selectedNode)) {
            const { parent } = selectedNode;
            activeGroup = selectedNode;
            if (TerminalManagerTreeTypes.isPageNode(parent)) {
                activePage = parent;
            }
        } else if (TerminalManagerTreeTypes.isPageNode(selectedNode)) {
            activePage = selectedNode;
        }

        this.activeTerminalNode = activeTerminal;
        this.activeGroupNode = activeGroup;
        this.activePageNode = activePage;
        this.onDidChangeTreeSelectionEmitter.fire({
            activePageId: activePage?.id,
            activeTerminalId: activeTerminal?.id,
            activeGroupId: activeGroup?.id,
        });
    }

    get pages(): Map<TerminalManagerTreeTypes.PageId, TerminalManagerTreeTypes.PageNode> {
        const pages = new Map<TerminalManagerTreeTypes.PageId, TerminalManagerTreeTypes.PageNode>();
        if (!this.root) {
            return pages;
        }
        for (const node of new DepthFirstTreeIterator(this.root)) {
            if (TerminalManagerTreeTypes.isPageNode(node)) {
                pages.set(node.id, node);
            }
        }
        return pages;
    }

    getPageIdForTerminal(terminalKey: TerminalManagerTreeTypes.TerminalKey): TerminalManagerTreeTypes.PageId | undefined {
        const terminalNode = this.getNode(terminalKey);
        if (!TerminalManagerTreeTypes.isTerminalNode(terminalNode)) {
            return undefined;
        }
        const { parentGroupId } = terminalNode;
        const groupNode = this.getNode(parentGroupId);
        if (!TerminalManagerTreeTypes.isGroupNode(groupNode)) {
            return undefined;
        }
        return groupNode.parentPageId;
    }

    selectTerminalNode(terminalKey: TerminalManagerTreeTypes.TerminalKey): void {
        const node = this.getNode(terminalKey);
        if (node && TerminalManagerTreeTypes.isTerminalNode(node)) {
            this.selectNode(node);
        }
    }

    protected async refreshWithSelection(refreshTarget?: CompositeTreeNode, selectionTarget?: SelectableTreeNode, selectionReferent?: TreeNode): Promise<void> {
        await this.refresh(refreshTarget);
        if (selectionTarget) {
            return this.selectNode(selectionTarget);
        }
        if (selectionReferent) {
            const { previousSibling, nextSibling } = selectionReferent;
            const toSelect = this.findSelection(previousSibling) ?? this.findSelection(nextSibling);
            if (toSelect) {
                this.selectNode(toSelect);
            }
        }
    }

    protected findSelection(start?: TreeNode): SelectableTreeNode | undefined {
        if (!start) { return undefined; }
        if (TerminalManagerTreeTypes.isTerminalNode(start)) { return start; }
        if (TerminalManagerTreeTypes.isGroupNode(start)) { return start.children.at(0); }
        if (TerminalManagerTreeTypes.isPageNode(start)) { return start.children.at(0)?.children.at(0); }
    }
}
