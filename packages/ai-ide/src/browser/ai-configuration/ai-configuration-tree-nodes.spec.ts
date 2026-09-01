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

import { expect } from 'chai';
import { CompositeTreeNode } from '@theia/core/lib/browser/tree/tree';
import { ExpandableTreeNode } from '@theia/core/lib/browser/tree/tree-expansion';
import { AiConfigurationCategory, AiConfigurationTreeItem } from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { AiConfigurationCategoryNode, AiConfigurationItemNode, AiConfigurationSeparatorNode, AiConfigurationTree } from './ai-configuration-tree-nodes';

function category(id: string, kind: 'single-page' | 'collection', options?: {
    contributed?: boolean;
    items?: AiConfigurationTreeItem[];
}): AiConfigurationCategory {
    return {
        id,
        label: id.toUpperCase(),
        iconClass: 'codicon codicon-gear',
        kind,
        contributed: options?.contributed,
        renderer: {
            getTreeChildren: kind === 'collection' ? () => options?.items ?? [] : undefined
        }
    };
}

describe('AiConfigurationTree.buildRoot', () => {

    it('builds an empty invisible root when there are no categories', () => {
        const root = AiConfigurationTree.buildRoot([]);
        expect(root.id).to.equal(AiConfigurationTree.ROOT_ID);
        expect(root.visible).to.equal(false);
        expect(root.children).to.have.length(0);
    });

    it('creates a non-expandable node for a single-page category', () => {
        const root = AiConfigurationTree.buildRoot([category('general', 'single-page')]);
        const node = root.children[0] as AiConfigurationCategoryNode;
        expect(AiConfigurationCategoryNode.is(node)).to.equal(true);
        expect(node.id).to.equal(AiConfigurationTree.categoryNodeId('general'));
        expect(ExpandableTreeNode.is(node)).to.equal(false);
        expect(node.children).to.have.length(0);
    });

    it('creates an expandable node with item children for a non-empty collection', () => {
        const items: AiConfigurationTreeItem[] = [
            { id: 'a', label: 'Agent A' },
            { id: 'b', label: 'Agent B' }
        ];
        const root = AiConfigurationTree.buildRoot([category('agents', 'collection', { items })]);
        const node = root.children[0] as AiConfigurationCategoryNode;
        // Expandable, but collapsed by default (categories start collapsed).
        expect(ExpandableTreeNode.is(node)).to.equal(true);
        expect(ExpandableTreeNode.isExpanded(node)).to.equal(false);
        expect(node.children.map(c => c.id)).to.deep.equal([
            AiConfigurationTree.itemNodeId('agents', 'a'),
            AiConfigurationTree.itemNodeId('agents', 'b')
        ]);
        const [first] = node.children;
        expect(AiConfigurationItemNode.is(first)).to.equal(true);
        expect(first.name).to.equal('Agent A');
        expect(first.parent).to.equal(node);
    });

    it("carries an item's status onto its node, so the tree can show it as a dot", () => {
        const items: AiConfigurationTreeItem[] = [
            { id: 'github', label: 'GitHub', status: { kind: 'on', label: 'Running' } },
            { id: 'local', label: 'Local', status: { kind: 'error', label: 'Errored', tooltip: 'spawn failed' } },
            { id: 'plain', label: 'Plain' }
        ];
        const root = AiConfigurationTree.buildRoot([category('mcp-servers', 'collection', { items })]);
        const children = (root.children[0] as AiConfigurationCategoryNode).children as AiConfigurationItemNode[];

        expect(children.map(child => child.status?.kind)).to.deep.equal(['on', 'error', undefined]);
        expect(children[1].status?.tooltip).to.equal('spawn failed');
    });

    it('keeps the first of two items claiming the same id, since a node is addressed by its id', () => {
        const items: AiConfigurationTreeItem[] = [
            { id: 'code-reviewer', label: 'Code Reviewer' },
            { id: 'code-reviewer', label: 'Code Reviewer (copy)' },
            { id: 'coder', label: 'Coder' }
        ];
        const root = AiConfigurationTree.buildRoot([category('agents', 'collection', { items })]);
        const children = (root.children[0] as AiConfigurationCategoryNode).children as AiConfigurationItemNode[];

        expect(children.map(child => child.name)).to.deep.equal(['Code Reviewer', 'Coder']);
        expect(new Set(children.map(child => child.id)).size).to.equal(children.length);
    });

    it('marks an empty collection as non-expandable', () => {
        const root = AiConfigurationTree.buildRoot([category('variables', 'collection', { items: [] })]);
        const node = root.children[0] as AiConfigurationCategoryNode;
        expect(ExpandableTreeNode.is(node)).to.equal(false);
    });

    it('preserves the previous expansion state', () => {
        const items: AiConfigurationTreeItem[] = [{ id: 'a', label: 'Agent A' }];
        const root = AiConfigurationTree.buildRoot([category('agents', 'collection', { items })], {
            isExpanded: id => id === 'agents' ? false : undefined
        });
        const node = root.children[0] as AiConfigurationCategoryNode;
        expect(ExpandableTreeNode.isCollapsed(node)).to.equal(true);
    });

    it('inserts a single separator before the first contributed category, preserving order', () => {
        const root = AiConfigurationTree.buildRoot([
            category('agents', 'collection', { items: [] }),
            category('tools', 'single-page'),
            category('sample-ext', 'single-page', { contributed: true }),
            category('other-ext', 'single-page', { contributed: true })
        ]);
        const ids = root.children.map(child => child.id);
        expect(ids).to.deep.equal([
            AiConfigurationTree.categoryNodeId('agents'),
            AiConfigurationTree.categoryNodeId('tools'),
            AiConfigurationTree.CONTRIBUTED_SEPARATOR_ID,
            AiConfigurationTree.categoryNodeId('sample-ext'),
            AiConfigurationTree.categoryNodeId('other-ext')
        ]);
        const separator = root.children.find(AiConfigurationSeparatorNode.is);
        expect(separator).to.not.equal(undefined);
        expect(root.children.filter(AiConfigurationSeparatorNode.is)).to.have.length(1);
    });

    it('omits the separator when there are no contributed categories', () => {
        const root = AiConfigurationTree.buildRoot([category('general', 'single-page')]);
        expect(root.children.some(AiConfigurationSeparatorNode.is)).to.equal(false);
    });

    it('wires child siblings via CompositeTreeNode', () => {
        const items: AiConfigurationTreeItem[] = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }];
        const root = AiConfigurationTree.buildRoot([category('agents', 'collection', { items })]);
        const node = root.children[0] as AiConfigurationCategoryNode;
        expect(CompositeTreeNode.is(node)).to.equal(true);
        expect(node.children[0].nextSibling).to.equal(node.children[1]);
    });
});
