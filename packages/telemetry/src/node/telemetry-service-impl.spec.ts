// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { ContributionProvider, Emitter } from '@theia/core/lib/common';
import * as sinon from 'sinon';
import { TELEMETRY_ENABLED, TELEMETRY_FILTERS, TelemetryPreferences } from '../common/telemetry-preferences';
import { TelemetryEvent } from '../common/telemetry-protocol';
import { RecordingLogger } from '../common/test/recording-logger';
import { TelemetryServiceImpl } from './telemetry-service-impl';
import { TelemetrySink } from './telemetry-sink';

interface TestPreferences extends TelemetryPreferences {
    setFilters(filters: Record<string, string[]>): void;
}

function createPreferences(enabled: boolean, initialFilters: Record<string, string[]>, ready = Promise.resolve()): TestPreferences {
    const emitter = new Emitter<never>();
    let filters = initialFilters;
    return {
        [TELEMETRY_ENABLED]: enabled,
        get [TELEMETRY_FILTERS](): Record<string, string[]> {
            return filters;
        },
        ready,
        onPreferenceChanged: emitter.event,
        setFilters: (newFilters: Record<string, string[]>) => {
            filters = newFilters;
            emitter.fire({ preferenceName: TELEMETRY_FILTERS, affects: () => true } as never);
        }
    } as unknown as TestPreferences;
}

function createSink(id: string, interests: readonly string[] = ['*']): TelemetrySink & { events: TelemetryEvent[] } {
    const events: TelemetryEvent[] = [];
    return {
        id,
        interests,
        events,
        handle: event => {
            events.push(event);
        }
    };
}

function createServiceWithPreferences(preferences: TelemetryPreferences, sinks: TelemetrySink[], logger = new RecordingLogger()): TelemetryServiceImpl {
    const provider: ContributionProvider<TelemetrySink> = { getContributions: () => sinks };
    return new TelemetryServiceImpl(preferences, provider, logger);
}

function createService(enabled: boolean, filters: Record<string, string[]>, sinks: TelemetrySink[], logger = new RecordingLogger()): TelemetryServiceImpl {
    return createServiceWithPreferences(createPreferences(enabled, filters), sinks, logger);
}

async function flushDispatch(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

async function reportEvent(service: TelemetryServiceImpl, event: TelemetryEvent = { topic: 'company/action', timestamp: 42 }): Promise<void> {
    await service.reportEvent(event);
    await flushDispatch();
}

describe('TelemetryServiceImpl', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers({ now: 1234 });
    });

    afterEach(() => clock.restore());

    it('denies delivery without sinks, filters, or global enablement', async () => {
        const sink = createSink('company/sink');
        await reportEvent(createService(true, {}, [sink]));
        await reportEvent(createService(true, { 'company/sink': [] }, [sink]));
        await reportEvent(createService(false, { 'company/sink': ['*'] }, [sink]));
        expect(sink.events).to.be.empty;
    });

    it('requires both the sink-specific filter and declared interest to match', async () => {
        const first = createSink('company/first', ['company/*']);
        const second = createSink('company/second', ['other/*']);
        const third = createSink('company/third', ['company/*']);
        const service = createService(true, {
            'company/first': ['company/action'],
            'company/second': ['*'],
            'company/third': ['other/*']
        }, [first, second, third]);

        await reportEvent(service);

        expect(first.events).to.have.length(1);
        expect(second.events).to.be.empty;
        expect(third.events).to.be.empty;
    });

    it('supports exact, terminal wildcard, and global filter/interest intersections', async () => {
        const exact = createSink('company/exact', ['company/action']);
        const prefix = createSink('company/prefix', ['company/*']);
        const global = createSink('company/global', ['*']);
        const service = createService(true, {
            'company/exact': ['company/action'],
            'company/prefix': ['company/*'],
            'company/global': ['*']
        }, [exact, prefix, global]);

        await reportEvent(service);
        await reportEvent(service, { topic: 'company/action/deep', timestamp: 43 });
        await reportEvent(service, { topic: 'other/action', timestamp: 44 });

        expect(exact.events.map(event => event.timestamp)).to.deep.equal([42]);
        expect(prefix.events.map(event => event.timestamp)).to.deep.equal([42, 43]);
        expect(global.events).to.have.length(3);
    });

    it('warns once per invalid filter until filters change', async () => {
        const sink = createSink('company/sink');
        const logger = new RecordingLogger();
        const preferences = createPreferences(true, { 'company/sink': ['company/**', '*/action', 'company/action'] });
        const service = createServiceWithPreferences(preferences, [sink], logger);

        await reportEvent(service, { topic: 'other/action', timestamp: 42 });
        await reportEvent(service);
        expect(sink.events).to.have.length(1);
        expect(logger.warnings).to.have.length(2);

        preferences.setFilters({ 'company/sink': ['invalid/**', '*'] });
        await reportEvent(service, { topic: 'other/action', timestamp: 43 });
        expect(sink.events).to.have.length(2);
        expect(logger.warnings).to.have.length(3);
    });

    it('rejects invalid and duplicate sink metadata', async () => {
        const invalidId = createSink('invalid');
        const emptyInterests = createSink('company/empty', []);
        const invalidInterests = createSink('company/interests', ['company/**']);
        const duplicateOne = createSink('company/duplicate');
        const duplicateTwo = createSink('company/duplicate');
        const valid = createSink('company/valid');
        const logger = new RecordingLogger();
        const service = createService(true, {
            'company/empty': ['*'],
            'company/interests': ['*'],
            'company/duplicate': ['*'],
            'company/valid': ['*']
        }, [invalidId, emptyInterests, invalidInterests, duplicateOne, duplicateTwo, valid], logger);

        await reportEvent(service);

        expect(invalidId.events).to.be.empty;
        expect(emptyInterests.events).to.be.empty;
        expect(invalidInterests.events).to.be.empty;
        expect(duplicateOne.events).to.be.empty;
        expect(duplicateTwo.events).to.be.empty;
        expect(valid.events).to.have.length(1);
        expect(logger.errors).to.have.length(5);
    });

    it('uses a snapshot of validated sink metadata', async () => {
        const sink = createSink('company/sink', ['company/action']);
        const service = createService(true, { 'company/sink': ['*'] }, [sink]);

        await reportEvent(service);
        (sink as { interests: readonly string[] }).interests = ['other/*'];
        await reportEvent(service);
        await reportEvent(service, { topic: 'other/action', timestamp: 43 });

        expect(sink.events.map(event => event.topic)).to.deep.equal(['company/action', 'company/action']);
    });

    it('timestamps direct reports and snapshots payloads before deferred dispatch', async () => {
        let resolveReady: () => void;
        const ready = new Promise<void>(resolve => resolveReady = resolve);
        const data = { action: 'open', durations: [1, 2], states: [true, false] };
        const sink = createSink('company/sink');
        const service = createServiceWithPreferences(createPreferences(true, { 'company/sink': ['*'] }, ready), [sink]);

        service.report('company/action', data);
        data.action = 'changed';
        data.durations.push(3);
        resolveReady!();
        await flushDispatch();

        expect(sink.events).to.have.length(1);
        expect(sink.events[0].data).to.deep.equal({ action: 'open', durations: [1, 2], states: [true, false] });
        expect(sink.events[0].data).not.to.equal(data);
        expect(Object.isFrozen(sink.events[0])).to.be.true;
        expect(Object.isFrozen(sink.events[0].data)).to.be.true;
        expect(Object.isFrozen(sink.events[0].data?.durations)).to.be.true;
        expect(sink.events[0].timestamp).to.equal(1234);
    });

    it('preserves RPC timestamps and isolates immutable payloads between sinks', async () => {
        const data = { action: 'open', durations: [1, 2] };
        const event = { topic: 'company/action', data, timestamp: 987 };
        const observed: TelemetryEvent[] = [];
        const mutating: TelemetrySink = {
            id: 'company/mutating',
            interests: ['*'],
            handle: received => {
                expect(() => Object.assign(received.data!, { action: 'changed' })).to.throw();
                expect(() => (received.data!.durations as number[]).push(3)).to.throw();
            }
        };
        const recording: TelemetrySink = {
            id: 'company/recording',
            interests: ['*'],
            handle: received => {
                observed.push(received);
            }
        };
        const service = createService(true, { 'company/mutating': ['*'], 'company/recording': ['*'] }, [mutating, recording]);

        await reportEvent(service, event);
        data.action = 'changed';
        data.durations.push(3);

        expect(observed[0].data).to.deep.equal({ action: 'open', durations: [1, 2] });
        expect(observed[0].timestamp).to.equal(987);
    });

    it('drops malformed reports and RPC values without logging payload values', async () => {
        const sink = createSink('company/sink');
        const logger = new RecordingLogger();
        const service = createService(true, { 'company/sink': ['*'] }, [sink], logger);

        service.report('invalid', { secret: 'payload-secret' });
        service.report('company/action', { mixed: [1, 'payload-secret'] } as never);
        await service.reportEvent({ topic: 'company/action', data: { nested: { secret: 'payload-secret' } } as never, timestamp: 42 });
        await service.reportEvent({ topic: 'company/action', timestamp: Number.POSITIVE_INFINITY });
        await service.reportEvent(undefined);
        await service.reportEvent('payload-secret');
        await service.reportEvent({ topic: 42, data: 'payload-secret', timestamp: 42 });
        await service.reportEvent({ data: { secret: 'payload-secret' }, timestamp: 42 });
        await flushDispatch();

        expect(sink.events).to.be.empty;
        expect(logger.warnings).to.have.length(8);
        expect(logger.warnings.join(' ')).not.to.contain('payload-secret');
    });

    it('handles preference readiness rejection once without payload logging', async () => {
        const logger = new RecordingLogger();
        const sink = createSink('company/sink');
        const preferences = createPreferences(true, { 'company/sink': ['*'] }, Promise.reject(new Error('payload-secret')));
        const service = createServiceWithPreferences(preferences, [sink], logger);

        await reportEvent(service);
        await reportEvent(service, { topic: 'company/other', timestamp: 43 });

        expect(sink.events).to.be.empty;
        expect(logger.errors).to.have.length(1);
        expect(logger.errors.join(' ')).not.to.contain('payload-secret');
    });

    it('uses the same policy path for direct and RPC reports', async () => {
        const sink = createSink('company/sink', ['company/*']);
        const service = createService(true, { 'company/sink': ['company/*'] }, [sink]);

        service.report('company/direct');
        await service.reportEvent({ topic: 'company/rpc', timestamp: 99 });
        await flushDispatch();

        expect(sink.events.map(event => event.topic)).to.deep.equal(['company/direct', 'company/rpc']);
        expect(sink.events.map(event => event.timestamp)).to.deep.equal([1234, 99]);
    });

    it('isolates void handlers, synchronous throws, asynchronous rejections, and slow sinks', async () => {
        const logger = new RecordingLogger();
        const successful = createSink('company/successful');
        const throwing: TelemetrySink = {
            id: 'company/throwing', interests: ['*'], handle: () => { throw new Error('payload-secret'); }
        };
        const rejecting: TelemetrySink = {
            id: 'company/rejecting', interests: ['*'], handle: () => Promise.reject(new Error('payload-secret'))
        };
        const slow: TelemetrySink = {
            id: 'company/slow', interests: ['*'], handle: () => new Promise<void>(() => undefined)
        };
        const filters = Object.fromEntries([successful, throwing, rejecting, slow].map(sink => [sink.id, ['*']]));

        await reportEvent(createService(true, filters, [throwing, slow, successful, rejecting], logger));
        await Promise.resolve();

        expect(successful.events).to.have.length(1);
        expect(logger.errors).to.have.length(2);
        expect(logger.errors.join(' ')).not.to.contain('payload-secret');
    });
});
