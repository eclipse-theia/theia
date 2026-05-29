// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    filterRoutinesByQuery,
    normalizeRoutineIntervalHours,
    routineIsDue,
    routineScheduleLabel,
    type QaapWorkHubRoutine,
} from './qaap-work-hub-routine';

function sampleRoutine(overrides: Partial<QaapWorkHubRoutine> = {}): QaapWorkHubRoutine {
    return {
        id: 'r1',
        title: 'Nightly tests',
        prompt: 'npm test',
        cwd: '/workspace/repos/qaap',
        trigger: 'interval',
        intervalHours: 24,
        enabled: true,
        createdAt: 1,
        updatedAt: 1,
        ...overrides,
    };
}

describe('qaap-work-hub-routine', () => {

    it('normalizeRoutineIntervalHours clamps to 1..168', () => {
        expect(normalizeRoutineIntervalHours(undefined)).to.equal(24);
        expect(normalizeRoutineIntervalHours(0)).to.equal(1);
        expect(normalizeRoutineIntervalHours(999)).to.equal(168);
    });

    it('routineScheduleLabel formats daily and manual', () => {
        expect(routineScheduleLabel(sampleRoutine({ trigger: 'manual' }))).to.equal('Manual');
        expect(routineScheduleLabel(sampleRoutine({ intervalHours: 24 }))).to.equal('Daily');
    });

    it('routineIsDue respects enabled, trigger, and last run', () => {
        const now = 1_000_000;
        expect(routineIsDue(sampleRoutine({ enabled: false }), now)).to.equal(false);
        expect(routineIsDue(sampleRoutine({ trigger: 'manual' }), now)).to.equal(false);
        expect(routineIsDue(sampleRoutine({ lastRunState: 'running' }), now)).to.equal(false);
        expect(routineIsDue(sampleRoutine({ lastRunAt: now - 25 * 60 * 60 * 1000 }), now)).to.equal(true);
        expect(routineIsDue(sampleRoutine({ lastRunAt: now - 60 * 60 * 1000 }), now)).to.equal(false);
    });

    it('filterRoutinesByQuery matches title and cwd', () => {
        const routines = [
            sampleRoutine({ id: 'a', title: 'Drift check' }),
            sampleRoutine({ id: 'b', title: 'CI fix', cwd: '/tmp/other' }),
        ];
        expect(filterRoutinesByQuery(routines, 'drift')).to.have.lengthOf(1);
        expect(filterRoutinesByQuery(routines, '/tmp/other')).to.have.lengthOf(1);
    });
});
