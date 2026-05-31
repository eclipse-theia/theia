// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { groupAgentTasksByParent, resolveLeaderTaskIdFromMessages } from './qaap-agent-task-tree';

describe('groupAgentTasksByParent', () => {
    it('groups children under their parent', () => {
        const tree = groupAgentTasksByParent([
            { id: 'leader' },
            { id: 'a', parentId: 'leader' },
            { id: 'b', parentId: 'leader' },
        ]);
        expect(tree.roots.map(t => t.id)).to.deep.equal(['leader']);
        expect(tree.childrenByParent.get('leader')?.map(t => t.id)).to.deep.equal(['a', 'b']);
    });

    it('treats orphans as roots when the parent is absent', () => {
        const tree = groupAgentTasksByParent([{ id: 'orphan', parentId: 'missing' }]);
        expect(tree.roots.map(t => t.id)).to.deep.equal(['orphan']);
        expect(tree.childrenByParent.size).to.equal(0);
    });
});

describe('resolveLeaderTaskIdFromMessages', () => {
    it('returns the latest user message taskId', () => {
        const id = resolveLeaderTaskIdFromMessages([
            { role: 'user', taskId: 'old' },
            { role: 'agent' },
            { role: 'user', taskId: 'current' },
        ]);
        expect(id).to.equal('current');
    });

    it('returns undefined when no user message has a taskId', () => {
        expect(resolveLeaderTaskIdFromMessages([{ role: 'user' }, { role: 'agent' }])).to.be.undefined;
    });
});
