// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import {
    cronSlotIsDue,
    formatCronScheduleLabel,
    isValidCronExpression,
    lastCronFireAt,
    nextCronFireAt,
    normalizeRoutineCronExpression,
    normalizeRoutineTimezone,
} from './qaap-work-hub-cron';

describe('qaap-work-hub-cron', () => {

    it('normalizeRoutineTimezone falls back on invalid zones', () => {
        expect(normalizeRoutineTimezone(undefined)).to.equal('UTC');
        expect(normalizeRoutineTimezone('Europe/Madrid')).to.equal('Europe/Madrid');
        expect(normalizeRoutineTimezone('Not/A/Zone')).to.equal('UTC');
    });

    it('isValidCronExpression accepts standard five-field cron', () => {
        expect(isValidCronExpression('0 6 * * *')).to.equal(true);
        expect(isValidCronExpression('not cron')).to.equal(false);
    });

    it('lastCronFireAt and nextCronFireAt bracket a daily slot', () => {
        const at = new Date('2026-05-30T07:30:00Z');
        const prev = lastCronFireAt('0 6 * * *', 'UTC', at);
        const next = nextCronFireAt('0 6 * * *', 'UTC', at);
        expect(prev?.toISOString()).to.equal('2026-05-30T06:00:00.000Z');
        expect(next?.toISOString()).to.equal('2026-05-31T06:00:00.000Z');
    });

    it('cronSlotIsDue fires once per cron slot', () => {
        const slot = Date.parse('2026-05-30T06:00:00.000Z');
        const before = slot - 1000;
        expect(cronSlotIsDue('0 6 * * *', 'UTC', before, slot + 60_000)).to.equal(true);
        expect(cronSlotIsDue('0 6 * * *', 'UTC', slot, slot + 60_000)).to.equal(false);
    });

    it('formatCronScheduleLabel includes timezone and one-shot', () => {
        expect(formatCronScheduleLabel('0 6 * * *', 'UTC')).to.equal('Daily at 6:00');
        expect(formatCronScheduleLabel('0 6 * * *', 'Europe/Madrid')).to.equal('Daily at 6:00 (Europe/Madrid)');
        expect(formatCronScheduleLabel('0 6 * * *', 'UTC', true)).to.equal('Daily at 6:00 · once');
    });

    it('normalizeRoutineCronExpression falls back to daily preset', () => {
        expect(normalizeRoutineCronExpression(undefined)).to.equal('0 6 * * *');
        expect(normalizeRoutineCronExpression('bad')).to.equal('0 6 * * *');
        expect(normalizeRoutineCronExpression('0 8 * * 1-5')).to.equal('0 8 * * 1-5');
    });
});
