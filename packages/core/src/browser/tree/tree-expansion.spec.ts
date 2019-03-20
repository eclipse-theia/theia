/********************************************************************************
 * Copyright (C) 2019 Thomas Drosdzoll.
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

import { expect } from 'chai';
import { MockTreeModel } from './test/mock-tree-model';
import { TreeModelImpl, TreeModel } from './tree-model';
import { TreeImpl, Tree, TreeNode, CompositeTreeNode } from './tree';
import { Container } from 'inversify';
import { TreeSelectionServiceImpl } from './tree-selection-impl';
import { TreeSelectionService } from './tree-selection';
import { TreeExpansionServiceImpl, TreeExpansionService, ExpandableTreeNode } from './tree-expansion';
import { TreeNavigationService } from './tree-navigation';
import { TreeSearch } from './tree-search';
import { FuzzySearch } from './fuzzy-search';
import { MockLogger } from '../../common/test/mock-logger';
import { ILogger } from '../../common';

// tslint:disable:no-unused-expression
describe('TreeExpansionService', () => {
  let model: TreeModel;
  beforeEach(() => {
    model = createTreeModel();
    model.root = MockTreeModel.HIERARCHICAL_MOCK_ROOT();
  });
  describe('expandNode', () => {
    it('won\'t expand an already expanded node', done => {
      const node: ExpandableTreeNode = retrieveNode<ExpandableTreeNode>('1');
      model.expandNode(node).then(result => {
        expect(result).to.be.false;
        done();
      });
    });

    it('will expand a collapsed node', done => {
      const node: ExpandableTreeNode = retrieveNode<ExpandableTreeNode>('1');
      model.collapseNode(node).then(() => {
        model.expandNode(node).then(result => {
          expect(result).to.be.true;
          done();
        });
      });
    });

    it('won\'t expand an undefined node', done => {
      model.expandNode(undefined).then(result => {
        expect(result).to.be.false;
        done();
      });
    });
  });

  describe('collapseNode', () => {
    it('will collapse an expanded node', done => {
      const node: ExpandableTreeNode = retrieveNode<ExpandableTreeNode>('1');
      model.collapseNode(node).then(result => {
        expect(result).to.be.true;
        done();
      });
    });

    it('won\'t collapse an already collapsed node', done => {
      const node: ExpandableTreeNode = retrieveNode<ExpandableTreeNode>('1');
      model.collapseNode(node).then(() => {
        model.collapseNode(node).then(result => {
          expect(result).to.be.false;
          done();
        });
      });
    });

    it('cannot collapse a leaf node', done => {
      const node: ExpandableTreeNode = retrieveNode<ExpandableTreeNode>('1.1.2');
      model.collapseNode(node).then(result => {
        expect(result).to.be.false;
        done();
      });
    });
  });

  describe('collapseAll', () => {
    it('will collapse all nodes recursively', done => {
      model.collapseAll(retrieveNode<CompositeTreeNode>('1')).then(result => {
        expect(result).to.be.true;
        done();
      });
    });

    it('won\'t collapse nodes recursively if the root node is collapsed already', done => {
      model.collapseNode(retrieveNode<ExpandableTreeNode>('1')).then(() => {
        model.collapseAll(retrieveNode<CompositeTreeNode>('1')).then(result => {
          expect(result).to.be.true;
          done();
        });
      });
    });
  });

  describe('toggleNodeExpansion', () => {
    it('changes the expansion state from expanded to collapsed', done => {
      const node = retrieveNode<ExpandableTreeNode>('1');
      model.onExpansionChanged((e: Readonly<ExpandableTreeNode>) => {
        expect(e).to.be.equal(node);
        expect(e.expanded).to.be.false;
      });
      model.toggleNodeExpansion(node).then(() => {
        done();
      });
    });

    it('changes the expansion state from collapsed to expanded', done => {
      const node = retrieveNode<ExpandableTreeNode>('1');
      model.collapseNode(node).then(() => {
      });
      model.onExpansionChanged((e: Readonly<ExpandableTreeNode>) => {
        expect(e).to.be.equal(node);
        expect(e.expanded).to.be.true;
      });
      model.toggleNodeExpansion(node).then(() => {
        done();
      });
    });
  });

  function createTreeModel(): TreeModel {
    const container = new Container({ defaultScope: 'Singleton' });
    container.bind(TreeImpl).toSelf();
    container.bind(Tree).toService(TreeImpl);
    container.bind(TreeSelectionServiceImpl).toSelf();
    container.bind(TreeSelectionService).toService(TreeSelectionServiceImpl);
    container.bind(TreeExpansionServiceImpl).toSelf();
    container.bind(TreeExpansionService).toService(TreeExpansionServiceImpl);
    container.bind(TreeNavigationService).toSelf();
    container.bind(TreeModelImpl).toSelf();
    container.bind(TreeModel).toService(TreeModelImpl);
    container.bind(TreeSearch).toSelf();
    container.bind(FuzzySearch).toSelf();
    container.bind(MockLogger).toSelf();
    container.bind(ILogger).to(MockLogger).inSingletonScope();
    return container.get(TreeModel);
  }
  function retrieveNode<T extends TreeNode>(id: string): Readonly<T> {
    const readonlyNode: Readonly<T> = model.getNode(id) as T;
    return readonlyNode;
  }
});
