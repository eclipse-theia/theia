// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    isAgentProcessAlive,
    removeRunningTaskSnapshot,
    upsertRunningTaskSnapshot,
} from './qaap-agent-task-running-snapshot';

describe('isAgentProcessAlive', () => {
    it('returns false for missing pids', () => {
        expect(isAgentProcessAlive(undefined)).to.be.false;
        expect(isAgentProcessAlive(0)).to.be.false;
    });

    it('returns true for the current process', () => {
        expect(isAgentProcessAlive(process.pid)).to.be.true;
    });
});

describe('running snapshot index helpers', () => {
    it('upserts and removes snapshots by task id', () => {
        const snapshot = {
            taskId: 'task-1',
            pid: 42,
            logBytes: 128,
            updatedAt: 1,
            cwd: '/repo',
        };
        const withTask = upsertRunningTaskSnapshot({}, snapshot);
        expect(withTask['task-1']).to.deep.equal(snapshot);
        const withoutTask = removeRunningTaskSnapshot(withTask, 'task-1');
        expect(withoutTask).to.deep.equal({});
    });
});
