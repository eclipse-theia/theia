// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    buildTeamTree,
    collectAgentMembers,
    countRunningTeamMembers,
    filterTeamMembersForDisplay,
} from './qaap-work-hub-team';

describe('collectAgentMembers', () => {
    it('includes streaming conversations and running subtasks', () => {
        const members = collectAgentMembers({
            conversations: [{
                projectId: 'p1',
                projectName: 'qaap-mobile-shell',
                cwd: '/srv/qaap-mobile-shell',
                id: 'conv-1',
                agentId: 'qaiq',
                title: 'Add team dashboard',
                status: 'streaming',
                createdAt: 1000,
                updatedAt: 2000,
            }],
            tasks: [
                { id: 'leader', title: 'Leader', command: 'qaiq …', cwd: '/srv/qaap-mobile-shell', state: 'running', createdAt: 1000 },
                { id: 'sub-1', title: 'CSS pass', command: 'codex …', cwd: '/srv/qaap-mobile-shell', state: 'running', createdAt: 1100, parentId: 'leader' },
            ],
        });
        expect(members.some(m => m.kind === 'conversation' && m.id === 'conv-1')).to.be.true;
        expect(members.some(m => m.id === 'leader')).to.be.false;
        const sub = members.find(m => m.id === 'sub-1');
        expect(sub?.kind).to.equal('subtask');
        expect(sub?.parentId).to.equal('conv-1');
    });

    it('keeps standalone leader tasks when no streaming conversation covers the cwd', () => {
        const members = collectAgentMembers({
            conversations: [],
            tasks: [
                { id: 'solo', title: 'Drift check', command: 'qaiq …', cwd: '/srv/core', state: 'running', createdAt: 1000 },
            ],
        });
        expect(members).to.have.length(1);
        expect(members[0].kind).to.equal('leader-task');
    });

    it('counts subtasks on the visible conversation leader', () => {
        const members = collectAgentMembers({
            conversations: [{
                projectId: 'p1',
                projectName: 'app',
                cwd: '/srv/app',
                id: 'conv-1',
                agentId: 'qaiq',
                title: 'Leader',
                status: 'streaming',
                createdAt: 1000,
                updatedAt: 2000,
            }],
            tasks: [
                { id: 'leader-task', title: 'hidden', command: 'qaiq …', cwd: '/srv/app', state: 'running', createdAt: 1000 },
                { id: 'sub-1', title: 'Sub', command: 'codex …', cwd: '/srv/app', state: 'running', createdAt: 1100, parentId: 'leader-task' },
            ],
        });
        const conv = members.find(m => m.id === 'conv-1');
        expect(conv?.childCount).to.equal(1);
    });
});

describe('buildTeamTree', () => {
    it('nests subtasks under their parent task id', () => {
        const members = collectAgentMembers({
            conversations: [],
            tasks: [
                { id: 'leader', title: 'Leader', command: 'qaiq …', cwd: '/srv/app', state: 'running', createdAt: 1000 },
                { id: 'sub', title: 'Sub', command: 'codex …', cwd: '/srv/app', state: 'running', createdAt: 1100, parentId: 'leader' },
            ],
        });
        const tree = buildTeamTree(members);
        expect(tree.roots.map(r => r.id)).to.deep.equal(['leader']);
        expect(tree.childrenByParent.get('leader')?.map(c => c.id)).to.deep.equal(['sub']);
    });
});

describe('filterTeamMembersForDisplay', () => {
    it('keeps parent rows when a child matches the query', () => {
        const members = collectAgentMembers({
            conversations: [{
                projectId: 'p1',
                projectName: 'app',
                cwd: '/srv/app',
                id: 'conv-1',
                agentId: 'qaiq',
                title: 'Leader task',
                status: 'streaming',
                createdAt: 1000,
                updatedAt: 2000,
            }],
            tasks: [
                { id: 'leader-task', title: 'hidden', command: 'qaiq …', cwd: '/srv/app', state: 'running', createdAt: 1000 },
                { id: 'sub-1', title: 'CSS pass', command: 'codex …', cwd: '/srv/app', state: 'running', createdAt: 1100, parentId: 'leader-task' },
            ],
        });
        const filtered = filterTeamMembersForDisplay(members, 'css');
        expect(filtered.some(m => m.id === 'conv-1')).to.be.true;
        expect(filtered.some(m => m.id === 'sub-1')).to.be.true;
    });
});

describe('countRunningTeamMembers', () => {
    it('counts streaming and running rows', () => {
        const count = countRunningTeamMembers([
            {
                id: 'a', kind: 'conversation', title: 'A', projectName: 'p', cwd: '/p', agentId: 'qaiq',
                state: 'streaming', childCount: 0, createdAt: 1, updatedAt: 2,
            },
            {
                id: 'b', kind: 'leader-task', title: 'B', projectName: 'p', cwd: '/p', agentId: 'codex',
                state: 'completed', childCount: 0, createdAt: 1, updatedAt: 2,
            },
        ]);
        expect(count).to.equal(1);
    });
});
