/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import * as assert from 'assert';
import { TreeNode, CompositeTreeNode, TreeImpl, Tree } from './tree';
import { TreeModel, TreeModelImpl } from './tree-model';
import { MockTreeModel } from './test/mock-tree-model';
import { expect } from 'chai';
import { Container } from 'inversify';
import { TreeSelectionServiceImpl } from './tree-selection-impl';
import { TreeSelectionService } from './tree-selection';
import { TreeExpansionServiceImpl, TreeExpansionService } from './tree-expansion';
import { TreeNavigationService } from './tree-navigation';
import { TreeSearch } from './tree-search';
import { FuzzySearch } from './fuzzy-search';
import { MockLogger } from '../../common/test/mock-logger';
import { ILogger } from '../../common';

// tslint:disable:no-unused-expression
describe('Tree', () => {

  it('addChildren', () => {
    assertTreeNode(`{
  "id": "parent",
  "name": "parent",
  "children": [
    {
      "id": "foo",
      "name": "foo",
      "parent": "parent",
      "nextSibling": "bar"
    },
    {
      "id": "bar",
      "name": "bar",
      "parent": "parent",
      "previousSibling": "foo",
      "nextSibling": "baz"
    },
    {
      "id": "baz",
      "name": "baz",
      "parent": "parent",
      "previousSibling": "bar"
    }
  ]
}`, getNode());
  });

  it('removeChild - first', () => {
    const node = getNode();
    CompositeTreeNode.removeChild(node, node.children[0]);
    assertTreeNode(`{
  "id": "parent",
  "name": "parent",
  "children": [
    {
      "id": "bar",
      "name": "bar",
      "parent": "parent",
      "nextSibling": "baz"
    },
    {
      "id": "baz",
      "name": "baz",
      "parent": "parent",
      "previousSibling": "bar"
    }
  ]
}`, node);
  });

  it('removeChild - second', () => {
    const node = getNode();
    CompositeTreeNode.removeChild(node, node.children[1]);
    assertTreeNode(`{
  "id": "parent",
  "name": "parent",
  "children": [
    {
      "id": "foo",
      "name": "foo",
      "parent": "parent",
      "nextSibling": "baz"
    },
    {
      "id": "baz",
      "name": "baz",
      "parent": "parent",
      "previousSibling": "foo"
    }
  ]
}`, node);
  });

  it('removeChild - third', () => {
    const node = getNode();
    CompositeTreeNode.removeChild(node, node.children[2]);
    assertTreeNode(`{
  "id": "parent",
  "name": "parent",
  "children": [
    {
      "id": "foo",
      "name": "foo",
      "parent": "parent",
      "nextSibling": "bar"
    },
    {
      "id": "bar",
      "name": "bar",
      "parent": "parent",
      "previousSibling": "foo"
    }
  ]
}`, node);
  });

  let model: TreeModel;
  beforeEach(() => {
    model = createTreeModel();
    model.root = MockTreeModel.HIERARCHICAL_MOCK_ROOT();
  });
  describe('getNode', () => {
    it('returns undefined for undefined nodes', done => {
      expect(model.getNode(undefined)).to.be.undefined;
      done();
    });

    it('returns undefined for a non-existing id', done => {
      expect(model.getNode('10')).to.be.undefined;
      done();
    });

    it('returns a valid node for existing an id', done => {
      expect(model.getNode('1.1')).not.to.be.undefined;
      done();
    });
  });

  describe('validateNode', () => {
    it('returns undefined for undefined nodes', done => {
      expect(model.validateNode(undefined)).to.be.undefined;
      done();
    });

    it('returns undefined for non-existing nodes', done => {
      expect(model.validateNode(MockTreeModel.Node.toTreeNode({ 'id': '10' }))).to.be.undefined;
      done();
    });

    it('returns a valid node for an existing node', done => {
      expect(model.validateNode(retrieveNode<TreeNode>('1.1'))).not.to.be.undefined;
      done();
    });
  });

  describe('refresh', () => {
    it('refreshes all composite nodes starting with the root', done => {
      let result: Boolean = true;
      const expectedRefreshedNodes = new Set([
        retrieveNode<CompositeTreeNode>('1'),
        retrieveNode<CompositeTreeNode>('1.1'),
        retrieveNode<CompositeTreeNode>('1.2')]);
      model.onNodeRefreshed((e: Readonly<CompositeTreeNode>) => {
        result = result && expectedRefreshedNodes.has(e);
        expectedRefreshedNodes.delete(e);
      });
      model.refresh().then(() => {
        expect(result).to.be.true;
        expect(expectedRefreshedNodes.size).to.be.equal(0);
        done();
      });
    });
  });

  describe('refresh(parent: Readonly<CompositeTreeNode>)', () => {
    it('refreshes all composite nodes starting with the provided node', done => {
      let result: Boolean = true;
      const expectedRefreshedNodes = new Set([
        retrieveNode<CompositeTreeNode>('1.2'),
        retrieveNode<CompositeTreeNode>('1.2.1')
      ]);
      model.onNodeRefreshed((e: Readonly<CompositeTreeNode>) => {
        result = result && expectedRefreshedNodes.has(e);
        expectedRefreshedNodes.delete(e);
      });
      model.refresh(retrieveNode<CompositeTreeNode>('1.2')).then(() => {
        expect(result).to.be.true;
        expect(expectedRefreshedNodes.size).to.be.equal(0);
        done();
      });
    });
  });

  function getNode(): CompositeTreeNode {
    return CompositeTreeNode.addChildren({
      id: 'parent',
      name: 'parent',
      children: [],
      parent: undefined
    }, [{
      id: 'foo',
      name: 'foo',
      parent: undefined
    }, {
      id: 'bar',
      name: 'bar',
      parent: undefined
    }, {
      id: 'baz',
      name: 'baz',
      parent: undefined
    }]);
  }

  function assertTreeNode(expectation: string, node: TreeNode): void {
    // tslint:disable-next-line:no-any
    assert.deepEqual(expectation, JSON.stringify(node, (key: keyof CompositeTreeNode, value: any) => {
      if (key === 'parent' || key === 'previousSibling' || key === 'nextSibling') {
        return value && value.id;
      }
      return value;
    }, 2));
  }

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
