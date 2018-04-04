/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import 'reflect-metadata';

import { Container } from 'inversify';
import { notEmpty } from '../../common/objects';
import { Tree, TreeImpl } from './tree';
import { MockTreeModel } from './test/mock-tree-model';
import { TreeNavigationService } from './tree-navigation';
import { TreeModel, TreeModelImpl } from './tree-model';
import { TreeSelectionService } from './tree-selection';
import { TreeSelectionServiceImpl } from './tree-selection-impl';
import { TreeExpansionService, TreeExpansionServiceImpl, ExpandableTreeNode } from './tree-expansion';
import { DepthFirstTreeIterator, BreadthFirstTreeIterator, BottomUpTreeIterator, TopDownTreeIterator, Iterators } from './tree-iterator';

// tslint:disable:no-unused-expression
// tslint:disable:max-line-length

describe('tree-iterator', () => {

    const model = createTreeModel();
    const findNode = (id: string) => model.getNode(id);

    beforeEach(() => {
        model.root = MockTreeModel.HIERARCHICAL_MOCK_ROOT();
    });

    test('should include root', () => {
        const expected = ['1'];
        const actual = [...new BottomUpTreeIterator(findNode('1')!)].map(node => node.id);
        expect(expected).toEqual(actual);
    });

    test('should return `undefined` after consuming the iterator', () => {
        const itr = new BottomUpTreeIterator(findNode('1')!);
        let next = itr.next();
        while (!next.done) {
            expect(next.value).toBeDefined();
            next = itr.next();
        }
        expect(next.done).toEqual(true);
        expect(next.value).toBeUndefined();
    });

    test('depth-first (no collapsed nodes)', () => {
        const expected = ['1', '1.1', '1.1.1', '1.1.2', '1.2', '1.2.1', '1.2.1.1', '1.2.1.2', '1.2.2', '1.2.3', '1.3'];
        const actual = [...new DepthFirstTreeIterator(model.root!)].map(node => node.id);
        expect(expected).toEqual(actual);
    });

    test('depth-first (with collapsed nodes)', () => {
        collapseNode('1.1', '1.2.1');
        const expected = ['1', '1.1', '1.2', '1.2.1', '1.2.2', '1.2.3', '1.3'];
        const actual = [...new DepthFirstTreeIterator(model.root!, { pruneCollapsed: true })].map(node => node.id);
        expect(expected).toEqual(actual);
    });

    test('breadth-first (no collapsed nodes)', () => {
        const expected = ['1', '1.1', '1.2', '1.3', '1.1.1', '1.1.2', '1.2.1', '1.2.2', '1.2.3', '1.2.1.1', '1.2.1.2'];
        const actual = [...new BreadthFirstTreeIterator(model.root!)].map(node => node.id);
        expect(expected).toEqual(actual);
    });

    test('breadth-first (with collapsed nodes)', () => {
        collapseNode('1.1', '1.2.1');
        const expected = ['1', '1.1', '1.2', '1.3', '1.2.1', '1.2.2', '1.2.3'];
        const actual = [...new BreadthFirstTreeIterator(model.root!, { pruneCollapsed: true })].map(node => node.id);
        expect(expected).toEqual(actual);
    });

    test('bottom-up (no collapsed nodes)', () => {
        const expected = ['1.2.2', '1.2.1.2', '1.2.1.1', '1.2.1', '1.2', '1.1.2', '1.1.1', '1.1', '1'];
        const actual = [...new BottomUpTreeIterator(findNode('1.2.2')!)].map(node => node.id);
        expect(expected).toEqual(actual);
    });

    test('bottom-up (with collapsed nodes)', () => {
        collapseNode('1.1', '1.2.1');
        const expected = ['1.2.2', '1.2.1', '1.2', '1.1', '1'];
        const actual = [...new BottomUpTreeIterator(findNode('1.2.2')!, { pruneCollapsed: true })].map(node => node.id);
        expect(expected).toEqual(actual);
    });

    test('top-down (no collapsed nodes)', () => {
        const expected = ['1.1.2', '1.2', '1.2.1', '1.2.1.1', '1.2.1.2', '1.2.2', '1.2.3', '1.3'];
        const actual = [...new TopDownTreeIterator(findNode('1.1.2')!)].map(node => node.id);
        expect(expected).toEqual(actual);
    });

    test('top-down (with collapsed nodes)', () => {
        collapseNode('1.2.1');
        const expected = ['1.1.2', '1.2', '1.2.1', '1.2.2', '1.2.3', '1.3'];
        const actual = [...new TopDownTreeIterator(findNode('1.1.2')!, { pruneCollapsed: true })].map(node => node.id);
        expect(expected).toEqual(actual);
    });

    function collapseNode(...ids: string[]): void {
        ids.map(findNode).filter(notEmpty).filter(ExpandableTreeNode.is).forEach(node => {
            model.collapseNode(node);
            expect(node).toHaveProperty('expanded', false);
        });
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
        return container.get(TreeModel);
    }

});

describe('iterators', () => {

    test('as-iterator', () => {
        const array = [1, 2, 3, 4];
        const itr = Iterators.asIterator(array);
        let next = itr.next();
        while (!next.done) {
            const { value } = next;
            expect(value).toBeDefined();
            const index = array.indexOf(value);
            expect(index).not.toEqual(-1);
            array.splice(index, 1);
            next = itr.next();
        }
        expect(array).toHaveLength(0);
    });

    test('cycle - without start', function () {
        const array = [1, 2, 3, 4];
        const itr = Iterators.cycle(array);
        const visitedItems = new Set();
        let next = itr.next();
        while (!next.done) {
            const { value } = next;
            expect(value).toBeDefined();
            if (visitedItems.has(value)) {
                expect(Array.from(visitedItems).sort()).toEqual(array.sort());
                break;
            }
            visitedItems.add(value);
            next = itr.next();
        }
    });

    test('cycle - with start', function () {
        const array = [1, 2, 3, 4];
        const itr = Iterators.cycle(array, 2);
        const visitedItems = new Set();
        let next = itr.next();
        expect(next.value).toEqual(2);
        while (!next.done) {
            const { value } = next;
            expect(value).toBeDefined();
            if (visitedItems.has(value)) {
                expect(Array.from(visitedItems).sort()).toEqual(array.sort());
                break;
            }
            visitedItems.add(value);
            next = itr.next();
        }
    });

});
