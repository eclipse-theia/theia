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
import { TreeNode, CompositeTreeNode } from './tree';

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

});
