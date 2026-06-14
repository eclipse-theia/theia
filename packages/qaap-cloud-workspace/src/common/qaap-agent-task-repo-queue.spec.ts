// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import type { QaapAgentTask } from './qaap-agent-task';
import {
    countRunningTasksForCwd,
    QAAP_AGENT_MAX_CONCURRENT_PER_REPO_ENV,
    resolveMaxConcurrentPerRepo,
    selectNextQueuedTask,
    shouldQueueTask,
} from './qaap-agent-task-repo-queue';

function task(partial: Partial<QaapAgentTask> & Pick<QaapAgentTask, 'id' | 'cwd' | 'state' | 'createdAt'>): QaapAgentTask {
    return {
        title: partial.title ?? partial.id,
        command: partial.command ?? partial.title ?? partial.id,
        ...partial,
    };
}

describe('resolveMaxConcurrentPerRepo', () => {
    it('defaults to 1 when unset', () => {
        expect(resolveMaxConcurrentPerRepo({})).to.equal(1);
    });

    it('reads a positive integer from env', () => {
        expect(resolveMaxConcurrentPerRepo({ [QAAP_AGENT_MAX_CONCURRENT_PER_REPO_ENV]: '3' })).to.equal(3);
    });

    it('falls back to 1 for invalid values', () => {
        expect(resolveMaxConcurrentPerRepo({ [QAAP_AGENT_MAX_CONCURRENT_PER_REPO_ENV]: '0' })).to.equal(1);
        expect(resolveMaxConcurrentPerRepo({ [QAAP_AGENT_MAX_CONCURRENT_PER_REPO_ENV]: 'nope' })).to.equal(1);
    });
});

describe('shouldQueueTask', () => {
    it('queues when running count reaches the cap', () => {
        expect(shouldQueueTask(0, 1)).to.be.false;
        expect(shouldQueueTask(1, 1)).to.be.true;
        expect(shouldQueueTask(2, 3)).to.be.false;
        expect(shouldQueueTask(3, 3)).to.be.true;
    });
});

describe('countRunningTasksForCwd', () => {
    it('counts only running tasks for the cwd', () => {
        const tasks = [
            task({ id: 'a', cwd: '/repo', state: 'running', createdAt: 1 }),
            task({ id: 'b', cwd: '/repo', state: 'queued', createdAt: 2 }),
            task({ id: 'c', cwd: '/other', state: 'running', createdAt: 3 }),
            task({ id: 'd', cwd: '/repo', state: 'completed', createdAt: 4 }),
        ];
        expect(countRunningTasksForCwd(tasks, '/repo')).to.equal(1);
    });
});

describe('selectNextQueuedTask', () => {
    it('returns the oldest queued task for the cwd', () => {
        const tasks = [
            task({ id: 'newer', cwd: '/repo', state: 'queued', createdAt: 200 }),
            task({ id: 'older', cwd: '/repo', state: 'queued', createdAt: 100 }),
            task({ id: 'other', cwd: '/other', state: 'queued', createdAt: 50 }),
        ];
        expect(selectNextQueuedTask(tasks, '/repo')?.id).to.equal('older');
    });

    it('returns undefined when nothing is queued', () => {
        const tasks = [
            task({ id: 'running', cwd: '/repo', state: 'running', createdAt: 1 }),
        ];
        expect(selectNextQueuedTask(tasks, '/repo')).to.be.undefined;
    });
});
