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
// http://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { expect } from 'chai';
import { ContributionProvider, ILogger } from '@theia/core/lib/common';
import * as sinon from 'sinon';
import { ANALYTICS_ENABLED, ANALYTICS_ROUTES, AnalyticsPreferences } from '../common/analytics-preferences';
import { AnalyticsEvent } from '../common/analytics-protocol';
import { AnalyticsServiceImpl } from './analytics-service-impl';
import { AnalyticsSink } from './analytics-sink';

interface TestLogger extends ILogger {
    warnings: string[];
    errors: string[];
}

function createLogger(): TestLogger {
    const warnings: string[] = [];
    const errors: string[] = [];
    return {
        warnings,
        errors,
        warn: message => {
            warnings.push(String(message));
            return Promise.resolve();
        },
        error: message => {
            errors.push(String(message));
            return Promise.resolve();
        }
    } as TestLogger;
}

function createPreferences(enabled: boolean, routes: Record<string, string[]>): AnalyticsPreferences {
    return {
        [ANALYTICS_ENABLED]: enabled,
        [ANALYTICS_ROUTES]: routes,
        ready: Promise.resolve()
    } as AnalyticsPreferences;
}

function createSink(id: string, interests: readonly string[] = ['*']): AnalyticsSink & { events: AnalyticsEvent[] } {
    const events: AnalyticsEvent[] = [];
    return {
        id,
        interests,
        events,
        handle: event => {
            events.push(event);
        }
    };
}

function createService(enabled: boolean, routes: Record<string, string[]>, sinks: AnalyticsSink[], logger = createLogger()): AnalyticsServiceImpl {
    const provider: ContributionProvider<AnalyticsSink> = { getContributions: () => sinks };
    return new AnalyticsServiceImpl(createPreferences(enabled, routes), provider, logger);
}

async function flushDispatch(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
}

async function reportEvent(service: AnalyticsServiceImpl, event: AnalyticsEvent = { topic: 'company/action', timestamp: 42 }): Promise<void> {
    await service.reportEvent(event);
    await flushDispatch();
}

describe('AnalyticsServiceImpl', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers({ now: 1234 });
    });

    afterEach(() => clock.restore());

    it('denies delivery without sinks, routes, or global enablement', async () => {
        const sink = createSink('company/sink');
        await reportEvent(createService(true, {}, [sink]));
        await reportEvent(createService(true, { 'company/sink': [] }, [sink]));
        await reportEvent(createService(false, { 'company/sink': ['*'] }, [sink]));
        expect(sink.events).to.be.empty;
    });

    it('requires both the sink-specific route and declared interest to match', async () => {
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

    it('supports exact, terminal wildcard, and global route/interest intersections', async () => {
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

    it('ignores invalid route patterns without broadening access', async () => {
        const sink = createSink('company/sink');
        const logger = createLogger();
        const service = createService(true, { 'company/sink': ['company/**', '*/action', 'company/action'] }, [sink], logger);

        await reportEvent(service, { topic: 'other/action', timestamp: 42 });
        await reportEvent(service);

        expect(sink.events).to.have.length(1);
        expect(logger.warnings).to.have.length(4);
    });

    it('rejects invalid and duplicate sink metadata', async () => {
        const invalidId = createSink('invalid');
        const emptyInterests = createSink('company/empty', []);
        const invalidInterests = createSink('company/interests', ['company/**']);
        const duplicateOne = createSink('company/duplicate');
        const duplicateTwo = createSink('company/duplicate');
        const valid = createSink('company/valid');
        const logger = createLogger();
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

    it('timestamps direct backend reports at report time and preserves payload values', async () => {
        const data = { action: 'open', durations: [1, 2], states: [true, false] };
        const sink = createSink('company/sink');
        const service = createService(true, { 'company/sink': ['*'] }, [sink]);

        service.report('company/action', data);
        await flushDispatch();

        expect(sink.events).to.have.length(1);
        expect(sink.events[0].data).to.equal(data);
        expect(sink.events[0].timestamp).to.equal(1234);
    });

    it('preserves RPC timestamps and delivers an immutable copied envelope', async () => {
        const data = { action: 'open', durations: [1, 2] };
        const event = { topic: 'company/action', data, timestamp: 987 };
        const sink = createSink('company/sink');

        await reportEvent(createService(true, { 'company/sink': ['*'] }, [sink]), event);

        expect(sink.events[0]).not.to.equal(event);
        expect(Object.isFrozen(sink.events[0])).to.be.true;
        expect(sink.events[0].data).to.equal(data);
        expect(sink.events[0].timestamp).to.equal(987);
    });

    it('drops malformed direct and RPC reports without logging payload values', async () => {
        const sink = createSink('company/sink');
        const logger = createLogger();
        const service = createService(true, { 'company/sink': ['*'] }, [sink], logger);

        service.report('invalid', { secret: 'payload-secret' });
        service.report('company/action', { mixed: [1, 'payload-secret'] } as never);
        await service.reportEvent({ topic: 'company/action', data: { nested: { secret: 'payload-secret' } } as never, timestamp: 42 });
        await service.reportEvent({ topic: 'company/action', timestamp: Number.POSITIVE_INFINITY });
        await flushDispatch();

        expect(sink.events).to.be.empty;
        expect(logger.warnings).to.have.length(4);
        expect(logger.warnings.join(' ')).not.to.contain('payload-secret');
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
        const logger = createLogger();
        const successful = createSink('company/successful');
        const throwing: AnalyticsSink = {
            id: 'company/throwing', interests: ['*'], handle: () => { throw new Error('payload-secret'); }
        };
        const rejecting: AnalyticsSink = {
            id: 'company/rejecting', interests: ['*'], handle: () => Promise.reject(new Error('payload-secret'))
        };
        const slow: AnalyticsSink = {
            id: 'company/slow', interests: ['*'], handle: () => new Promise<void>(() => undefined)
        };
        const routes = Object.fromEntries([successful, throwing, rejecting, slow].map(sink => [sink.id, ['*']]));

        await reportEvent(createService(true, routes, [throwing, slow, successful, rejecting], logger));
        await Promise.resolve();

        expect(successful.events).to.have.length(1);
        expect(logger.errors).to.have.length(2);
        expect(logger.errors.join(' ')).not.to.contain('payload-secret');
    });
});
