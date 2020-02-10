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

import { expect } from 'chai';
import { notEmpty } from '../../common/objects';
import { MockTreeModel } from './test/mock-tree-model';
import { TreeModel } from './tree-model';
import { DepthFirstTreeIterator, BreadthFirstTreeIterator, BottomUpTreeIterator, TopDownTreeIterator, Iterators } from './tree-iterator';
import { createTreeTestContainer } from './test/tree-test-container';
import { ExpandableTreeNode } from './tree-expansion';

/* eslint-disable no-unused-expressions */
/* eslint-disable max-len */

describe('tree-iterator', () => {

    const model = createTreeModel();
    const findNode = (id: string) => model.getNode(id);

    beforeEach(() => {
        model.root = MockTreeModel.HIERARCHICAL_MOCK_ROOT();
    });

    it('should include root', () => {
        const expected = ['1'];
        const actual = [...new BottomUpTreeIterator(findNode('1')!)].map(node => node.id);
        expect(expected).to.be.deep.equal(actual);
    });

    it('should return `undefined` after consuming the iterator', () => {
        const itr = new BottomUpTreeIterator(findNode('1')!);
        let next = itr.next();
        while (!next.done) {
            expect(next.value).to.be.not.undefined;
            next = itr.next();
        }
        expect(next.done).to.be.true;
        expect(next.value).to.be.undefined;
    });

    it('depth-first (no collapsed nodes)', () => {
        const expected = ['1', '1.1', '1.1.1', '1.1.2', '1.2', '1.2.1', '1.2.1.1', '1.2.1.2', '1.2.2', '1.2.3', '1.3'];
        const actual = [...new DepthFirstTreeIterator(model.root!)].map(node => node.id);
        expect(expected).to.be.deep.equal(actual);
    });

    it('depth-first (with collapsed nodes)', () => {
        collapseNode('1.1', '1.2.1');
        const expected = ['1', '1.1', '1.2', '1.2.1', '1.2.2', '1.2.3', '1.3'];
        const actual = [...new DepthFirstTreeIterator(model.root!, { pruneCollapsed: true })].map(node => node.id);
        expect(expected).to.be.deep.equal(actual);
    });

    it('breadth-first (no collapsed nodes)', () => {
        const expected = ['1', '1.1', '1.2', '1.3', '1.1.1', '1.1.2', '1.2.1', '1.2.2', '1.2.3', '1.2.1.1', '1.2.1.2'];
        const actual = [...new BreadthFirstTreeIterator(model.root!)].map(node => node.id);
        expect(expected).to.be.deep.equal(actual);
    });

    it('breadth-first (with collapsed nodes)', () => {
        collapseNode('1.1', '1.2.1');
        const expected = ['1', '1.1', '1.2', '1.3', '1.2.1', '1.2.2', '1.2.3'];
        const actual = [...new BreadthFirstTreeIterator(model.root!, { pruneCollapsed: true })].map(node => node.id);
        expect(expected).to.be.deep.equal(actual);
    });

    it('bottom-up (no collapsed nodes)', () => {
        const expected = ['1.2.2', '1.2.1.2', '1.2.1.1', '1.2.1', '1.2', '1.1.2', '1.1.1', '1.1', '1'];
        const actual = [...new BottomUpTreeIterator(findNode('1.2.2')!)].map(node => node.id);
        expect(expected).to.be.deep.equal(actual);
    });

    it('bottom-up (with collapsed nodes)', () => {
        collapseNode('1.1', '1.2.1');
        const expected = ['1.2.2', '1.2.1', '1.2', '1.1', '1'];
        const actual = [...new BottomUpTreeIterator(findNode('1.2.2')!, { pruneCollapsed: true })].map(node => node.id);
        expect(expected).to.be.deep.equal(actual);
    });

    it('top-down (no collapsed nodes)', () => {
        const expected = ['1.1.2', '1.2', '1.2.1', '1.2.1.1', '1.2.1.2', '1.2.2', '1.2.3', '1.3'];
        const actual = [...new TopDownTreeIterator(findNode('1.1.2')!)].map(node => node.id);
        expect(expected).to.be.deep.equal(actual);
    });

    it('top-down (with collapsed nodes)', () => {
        collapseNode('1.2.1');
        const expected = ['1.1.2', '1.2', '1.2.1', '1.2.2', '1.2.3', '1.3'];
        const actual = [...new TopDownTreeIterator(findNode('1.1.2')!, { pruneCollapsed: true })].map(node => node.id);
        expect(expected).to.be.deep.equal(actual);
    });

    function collapseNode(...ids: string[]): void {
        ids.map(findNode).filter(notEmpty).filter(ExpandableTreeNode.is).forEach(node => {
            model.collapseNode(node);
            expect(node).to.have.property('expanded', false);
        });
    }

    function createTreeModel(): TreeModel {
        return createTreeTestContainer().get(TreeModel);
    }

});

describe('iterators', () => {

    it('as-iterator', () => {
        const array = [1, 2, 3, 4];
        const itr = Iterators.asIterator(array);
        let next = itr.next();
        while (!next.done) {
            const { value } = next;
            expect(value).to.be.not.undefined;
            const index = array.indexOf(value);
            expect(index).to.be.not.equal(-1);
            array.splice(index, 1);
            next = itr.next();
        }
        expect(array).to.be.empty;
    });

    it('cycle - without start', function (): void {
        this.timeout(1000);
        const array = [1, 2, 3, 4];
        const itr = Iterators.cycle(array);
        const visitedItems = new Set();
        let next = itr.next();
        while (!next.done) {
            const { value } = next;
            expect(value).to.be.not.undefined;
            if (visitedItems.has(value)) {
                expect(Array.from(visitedItems).sort()).to.be.deep.equal(array.sort());
                break;
            }
            visitedItems.add(value);
            next = itr.next();
        }
    });

    it('cycle - with start', function (): void {
        this.timeout(1000);
        const array = [1, 2, 3, 4];
        const itr = Iterators.cycle(array, 2);
        const visitedItems = new Set();
        let next = itr.next();
        expect(next.value).to.be.equal(2);
        while (!next.done) {
            const { value } = next;
            expect(value).to.be.not.undefined;
            if (visitedItems.has(value)) {
                expect(Array.from(visitedItems).sort()).to.be.deep.equal(array.sort());
                break;
            }
            visitedItems.add(value);
            next = itr.next();
        }
    });

});
