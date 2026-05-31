// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { cwdMatchesProject, normalizeCwd, sortTasks, toTaskView } from './mobile-projects-active-tasks';

describe('normalizeCwd', () => {
    it('strips trailing slashes', () => {
        expect(normalizeCwd('/home/user/project/')).to.equal('/home/user/project');
        expect(normalizeCwd('/home/user/project///')).to.equal('/home/user/project');
    });

    it('normalizes backslashes to forward slashes', () => {
        expect(normalizeCwd('C:\\Users\\user\\project')).to.equal('C:/Users/user/project');
    });

    it('preserves root slash', () => {
        expect(normalizeCwd('/')).to.equal('/');
    });

    it('leaves already-normalized paths unchanged', () => {
        expect(normalizeCwd('/home/user/project')).to.equal('/home/user/project');
    });
});

describe('cwdMatchesProject', () => {
    it('matches by basename equality', () => {
        expect(cwdMatchesProject('/home/user/my-app', { name: 'my-app' })).to.be.true;
        expect(cwdMatchesProject('/home/user/other', { name: 'my-app' })).to.be.false;
    });

    it('matches by github owner/name path suffix', () => {
        const project = { name: 'repo', github: { owner: 'acme', name: 'repo' } };
        expect(cwdMatchesProject('/home/user/acme/repo', project)).to.be.true;
        expect(cwdMatchesProject('/home/user/repos/acme/repo', project)).to.be.true;
    });

    it('is case-insensitive', () => {
        expect(cwdMatchesProject('/home/user/My-App', { name: 'my-app' })).to.be.true;
    });

    it('does not match partial basename', () => {
        expect(cwdMatchesProject('/home/user/my-app-extra', { name: 'my-app' })).to.be.false;
    });
});

describe('sortTasks', () => {
    it('puts running tasks before completed ones', () => {
        const tasks = [
            { id: 'a', title: 'A', command: '', cwd: '/', state: 'completed', createdAt: 2000 },
            { id: 'b', title: 'B', command: '', cwd: '/', state: 'running', createdAt: 1000 },
        ];
        const sorted = sortTasks(tasks);
        expect(sorted[0].id).to.equal('b');
        expect(sorted[1].id).to.equal('a');
    });

    it('sorts by createdAt descending within same state', () => {
        const tasks = [
            { id: 'a', title: 'A', command: '', cwd: '/', state: 'completed', createdAt: 1000 },
            { id: 'b', title: 'B', command: '', cwd: '/', state: 'completed', createdAt: 2000 },
        ];
        const sorted = sortTasks(tasks);
        expect(sorted[0].id).to.equal('b');
    });

    it('does not mutate the input array', () => {
        const tasks = [
            { id: 'a', title: 'A', command: '', cwd: '/', state: 'completed', createdAt: 2000 },
            { id: 'b', title: 'B', command: '', cwd: '/', state: 'running', createdAt: 1000 },
        ];
        const original = [...tasks];
        sortTasks(tasks);
        expect(tasks).to.deep.equal(original);
    });
});

describe('toTaskView', () => {
    it('uses title when provided', () => {
        const view = toTaskView({ id: 'x', cwd: '/a', state: 'running', title: 'My task', createdAt: 1000 });
        expect(view.title).to.equal('My task');
    });

    it('falls back to command when title is absent', () => {
        const view = toTaskView({ id: 'x', cwd: '/a', state: 'running', command: 'ls -la', createdAt: 1000 });
        expect(view.title).to.equal('ls -la');
    });

    it('falls back to Background task when both title and command are absent', () => {
        const view = toTaskView({ id: 'x', cwd: '/a', state: 'running', createdAt: 1000 });
        expect(view.title).to.equal('Background task');
    });

    it('truncates long commands to 80 characters in title', () => {
        const cmd = 'a'.repeat(100);
        const view = toTaskView({ id: 'x', cwd: '/a', state: 'running', command: cmd, createdAt: 1000 });
        expect(view.title.length).to.equal(80);
    });

    it('preserves parentId when provided', () => {
        const view = toTaskView({ id: 'x', cwd: '/a', state: 'running', parentId: 'leader', createdAt: 1000 });
        expect(view.parentId).to.equal('leader');
    });

    it('normalizes cwd in the returned view', () => {
        const view = toTaskView({ id: 'x', cwd: '/a/b/', state: 'running', createdAt: 1000 });
        expect(view.cwd).to.equal('/a/b');
    });
});
