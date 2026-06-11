// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    chatModelTreeNodeIdsMatch,
    isChatModelTreeStructureChange,
    needsCoalescedTreePaintWithoutRecreate,
    shouldSkipChatModelTreeRecreate,
} from './qaap-chat-view-tree-incremental';

describe('qaap-chat-view-tree-incremental', () => {

    it('isChatModelTreeStructureChange detects branch and request mutations', () => {
        expect(isChatModelTreeStructureChange({ kind: 'addRequest', request: {} as never })).to.equal(true);
        expect(isChatModelTreeStructureChange({ kind: 'removeRequest', requestId: 'r1', reason: 'removal' })).to.equal(true);
        expect(isChatModelTreeStructureChange({ kind: 'changeHierarchyBranch', branch: {} as never })).to.equal(true);
        expect(isChatModelTreeStructureChange({ kind: 'responseChanged' })).to.equal(false);
        expect(isChatModelTreeStructureChange({ kind: 'addVariable' })).to.equal(false);
    });

    it('chatModelTreeNodeIdsMatch compares request/response pairs in order', () => {
        expect(chatModelTreeNodeIdsMatch(
            ['req-1', 'res-1', 'req-2', 'res-2'],
            ['req-1', 'req-2'],
            ['res-1', 'res-2'],
        )).to.equal(true);
        expect(chatModelTreeNodeIdsMatch(
            ['req-1', 'res-1'],
            ['req-1', 'req-2'],
            ['res-1', 'res-2'],
        )).to.equal(false);
        expect(chatModelTreeNodeIdsMatch(undefined, ['req-1'], ['res-1'])).to.equal(false);
    });

    it('shouldSkipChatModelTreeRecreate skips streaming ticks when ids still match', () => {
        const childIds = ['req-1', 'res-1'];
        expect(shouldSkipChatModelTreeRecreate(
            { kind: 'responseChanged' },
            childIds,
            ['req-1'],
            ['res-1'],
        )).to.equal(true);
        expect(shouldSkipChatModelTreeRecreate(
            { kind: 'addRequest', request: {} as never },
            childIds,
            ['req-1'],
            ['res-1'],
        )).to.equal(false);
    });

    it('needsCoalescedTreePaintWithoutRecreate excludes responseChanged', () => {
        expect(needsCoalescedTreePaintWithoutRecreate({ kind: 'responseChanged' })).to.equal(false);
        expect(needsCoalescedTreePaintWithoutRecreate({ kind: 'addVariable' })).to.equal(true);
        expect(needsCoalescedTreePaintWithoutRecreate({ kind: 'interactionNeeded', contentPart: {} as never })).to.equal(true);
    });
});
