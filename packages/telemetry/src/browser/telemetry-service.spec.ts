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
import { Emitter } from '@theia/core/lib/common';
import * as sinon from 'sinon';
import { TELEMETRY_ENABLED, TELEMETRY_FILTERS, TelemetryPreferences } from '../common/telemetry-preferences';
import { TelemetryEvent, TelemetryRpc } from '../common/telemetry-protocol';
import { RecordingLogger } from '../common/test/recording-logger';
import { BrowserTelemetryService } from './telemetry-service';

interface TestPreferences extends TelemetryPreferences {
    setEnabled(enabled: boolean): void;
}

interface Deferred<T> {
    readonly promise: Promise<T>;
    readonly resolve: (value: T | PromiseLike<T>) => void;
    readonly reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve: resolve!, reject: reject! };
}

function createPreferences(enabled: boolean, ready: Promise<void>): TestPreferences {
    const emitter = new Emitter<never>();
    let currentEnabled = enabled;
    return {
        get [TELEMETRY_ENABLED](): boolean {
            return currentEnabled;
        },
        [TELEMETRY_FILTERS]: {},
        ready,
        onPreferenceChanged: emitter.event,
        setEnabled: (newEnabled: boolean) => {
            currentEnabled = newEnabled;
            emitter.fire({ preferenceName: TELEMETRY_ENABLED, affects: () => true } as never);
        }
    } as unknown as TestPreferences;
}

function createRpc(events: TelemetryEvent[], failure?: Error): TelemetryRpc {
    return {
        reportEvent: event => {
            events.push(event);
            return failure ? Promise.reject(failure) : Promise.resolve();
        }
    };
}

describe('BrowserTelemetryService', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers({ now: 1234 });
    });

    afterEach(() => clock.restore());

    it('forwards before frontend preferences are ready', () => {
        const events: TelemetryEvent[] = [];
        const readiness = deferred<void>();
        const service = new BrowserTelemetryService(createRpc(events), createPreferences(false, readiness.promise), new RecordingLogger());

        service.report('company/action', { enabled: true });

        expect(events).to.deep.equal([
            { topic: 'company/action', data: { enabled: true }, timestamp: 1234 }
        ]);
    });

    it('skips validation, snapshotting, timestamps, and RPC once preferences are ready and disabled', async () => {
        const events: TelemetryEvent[] = [];
        const readiness = deferred<void>();
        const logger = new RecordingLogger();
        const service = new BrowserTelemetryService(createRpc(events), createPreferences(false, readiness.promise), logger);
        const dateNow = sinon.spy(Date, 'now');
        const invalidData = Object.defineProperty({}, 'value', {
            enumerable: true,
            get: () => { throw new Error('data accessed'); }
        });

        readiness.resolve();
        await readiness.promise;
        await Promise.resolve();

        expect(() => service.report('invalid', invalidData as never)).not.to.throw();
        expect(dateNow.callCount).to.equal(0);
        expect(events).to.be.empty;
        expect(logger.warnings).to.be.empty;
    });

    it('assigns report-time timestamps and forwards valid events when preferences are ready and enabled', async () => {
        const events: TelemetryEvent[] = [];
        const readiness = deferred<void>();
        const service = new BrowserTelemetryService(createRpc(events), createPreferences(true, readiness.promise), new RecordingLogger());
        readiness.resolve();
        await readiness.promise;
        await Promise.resolve();

        service.report('company/action', { enabled: true });
        clock.tick(10);
        service.report('company/other', { count: 3 });

        expect(events).to.deep.equal([
            { topic: 'company/action', data: { enabled: true }, timestamp: 1234 },
            { topic: 'company/other', data: { count: 3 }, timestamp: 1244 }
        ]);
    });

    it('continues forwarding if frontend preference readiness rejects', async () => {
        const events: TelemetryEvent[] = [];
        const readiness = deferred<void>();
        const service = new BrowserTelemetryService(createRpc(events), createPreferences(false, readiness.promise), new RecordingLogger());
        readiness.reject(new Error('preferences unavailable'));
        await readiness.promise.catch(() => undefined);
        await Promise.resolve();

        service.report('company/action', { enabled: true });

        expect(events).to.have.length(1);
    });

    it('immediately follows enabled preference changes after readiness', async () => {
        const events: TelemetryEvent[] = [];
        const readiness = deferred<void>();
        const preferences = createPreferences(false, readiness.promise);
        const service = new BrowserTelemetryService(createRpc(events), preferences, new RecordingLogger());
        readiness.resolve();
        await readiness.promise;
        await Promise.resolve();

        service.report('company/disabled');
        preferences.setEnabled(true);
        service.report('company/enabled');
        preferences.setEnabled(false);
        service.report('company/disabled-again');

        expect(events.map(event => event.topic)).to.deep.equal(['company/enabled']);
    });

    it('forwards immutable snapshots of scalar and homogeneous array values', () => {
        const events: TelemetryEvent[] = [];
        const service = new BrowserTelemetryService(createRpc(events), createPreferences(true, Promise.resolve()), new RecordingLogger());
        const data = {
            text: 'value',
            count: 3,
            enabled: true,
            strings: ['first', 'second'],
            numbers: [1, 2],
            booleans: [true, false],
            empty: [] as string[]
        };

        service.report('company/action', data);

        expect(events).to.have.length(1);
        expect(events[0].data).to.deep.equal(data);
        expect(events[0].data).not.to.equal(data);
        expect(events[0].data?.strings).not.to.equal(data.strings);
        expect(events[0].data?.numbers).not.to.equal(data.numbers);
        expect(events[0].data?.booleans).not.to.equal(data.booleans);
        expect(events[0].data?.empty).not.to.equal(data.empty);
        expect(Object.isFrozen(events[0].data)).to.be.true;
        expect(Object.isFrozen(events[0].data?.strings)).to.be.true;

        data.text = 'changed';
        data.strings.push('changed');
        expect(events[0].data?.text).to.equal('value');
        expect(events[0].data?.strings).to.deep.equal(['first', 'second']);
    });

    it('does not forward invalid topics or payloads', () => {
        const events: TelemetryEvent[] = [];
        const logger = new RecordingLogger();
        const service = new BrowserTelemetryService(createRpc(events), createPreferences(true, Promise.resolve()), logger);
        const sparse = new Array<string>(2);
        sparse[1] = 'value';
        const invalidCases: Array<[unknown, unknown]> = [
            ['invalid', { value: true }],
            ['company/action', ['value']],
            ['company/action', { values: ['value', 1] }],
            ['company/action', { values: [['value']] }],
            ['company/action', { values: sparse }]
        ];

        for (const [topic, data] of invalidCases) {
            service.report(topic as string, data as never);
        }

        expect(events).to.be.empty;
        expect(logger.warnings).to.have.length(invalidCases.length);
    });

    it('contains RPC rejection and does not log payload values', async () => {
        const events: TelemetryEvent[] = [];
        const logger = new RecordingLogger();
        const service = new BrowserTelemetryService(createRpc(events, new Error('connection failed')), createPreferences(true, Promise.resolve()), logger);
        const secret = 'sensitive-payload-value';

        expect(() => service.report('company/action', { secret })).not.to.throw();
        await Promise.resolve();

        expect(events).to.have.length(1);
        expect(logger.errors).to.deep.equal(["Failed to report telemetry event for topic 'company/action'."]);
        expect(logger.errors.join(' ')).not.to.contain(secret);
    });
});
