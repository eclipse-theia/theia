// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    areAllSubtasksSettled,
    buildTeamSynthesisUserMessage,
    formatSubtaskMailboxMessage,
    inferAgentIdFromTaskCommand,
    isSubtaskOfLeader,
    isTeamSynthesisUserMessage,
    TEAM_SYNTHESIS_USER_PREFIX,
    truncateTeamMailboxLog,
} from './qaap-team-mailbox';

describe('inferAgentIdFromTaskCommand', () => {
    it('detects agent CLIs from the spawned command', () => {
        expect(inferAgentIdFromTaskCommand('qaiq -p "fix"')).to.equal('qaiq');
        expect(inferAgentIdFromTaskCommand('codex exec "fix"')).to.equal('codex');
        expect(inferAgentIdFromTaskCommand('npm test')).to.equal('shell');
    });
});

describe('truncateTeamMailboxLog', () => {
    it('keeps short logs intact', () => {
        expect(truncateTeamMailboxLog('hello')).to.equal('hello');
    });

    it('truncates from the start and keeps the tail', () => {
        const log = 'a'.repeat(20);
        const result = truncateTeamMailboxLog(log, 10);
        expect(result).to.include('10 chars truncated');
        expect(result.endsWith('a'.repeat(10))).to.equal(true);
    });
});

describe('formatSubtaskMailboxMessage', () => {
    it('includes task metadata and log excerpt', () => {
        const body = formatSubtaskMailboxMessage(
            {
                id: 'sub-1',
                title: 'CSS pass',
                state: 'completed',
                exitCode: 0,
                command: 'codex exec "style dashboard"',
            },
            'done\n',
        );
        expect(body).to.include('[Team · subtask · sub-1]');
        expect(body).to.include('@codex');
        expect(body).to.include('Status: completed');
        expect(body).to.include('CSS pass');
        expect(body).to.include('--- output ---');
        expect(body).to.include('done');
    });

    it('reports failure exit codes', () => {
        const body = formatSubtaskMailboxMessage(
            {
                id: 'sub-2',
                title: 'Tests',
                state: 'failed',
                exitCode: 1,
                command: 'qaiq -p "run tests"',
            },
            '',
        );
        expect(body).to.include('Status: failed (exit 1)');
        expect(body).not.to.include('--- output ---');
    });
});

describe('isSubtaskOfLeader', () => {
    const tasks = [
        { id: 'leader', parentId: undefined, state: 'completed' as const },
        { id: 'sub-a', parentId: 'leader', state: 'completed' as const },
        { id: 'sub-b', parentId: 'sub-a', state: 'running' as const },
    ];

    it('matches direct and nested descendants', () => {
        expect(isSubtaskOfLeader(tasks[1], 'leader', tasks)).to.equal(true);
        expect(isSubtaskOfLeader(tasks[2], 'leader', tasks)).to.equal(true);
        expect(isSubtaskOfLeader(tasks[0], 'leader', tasks)).to.equal(false);
    });
});

describe('areAllSubtasksSettled', () => {
    it('requires at least one subtask and all terminal', () => {
        expect(areAllSubtasksSettled([])).to.equal(false);
        expect(areAllSubtasksSettled([{ state: 'running' }])).to.equal(false);
        expect(areAllSubtasksSettled([{ state: 'completed' }, { state: 'failed' }])).to.equal(true);
    });
});

describe('buildTeamSynthesisUserMessage', () => {
    it('uses the synthesis prefix and mentions failures', () => {
        const message = buildTeamSynthesisUserMessage(3, 1);
        expect(message).to.include(TEAM_SYNTHESIS_USER_PREFIX);
        expect(message).to.include('3 delegated sub-tasks finished (1 failed)');
        expect(isTeamSynthesisUserMessage(message)).to.equal(true);
    });
});
