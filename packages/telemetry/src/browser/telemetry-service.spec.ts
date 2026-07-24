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
import { TelemetryConsentProvider, TelemetryLevel } from '../common/telemetry-consent-provider';
import { TelemetryEvent, TelemetryRpc } from '../common/telemetry-protocol';
import { RecordingLogger } from '../common/test/recording-logger';
import { BrowserTelemetryService } from './telemetry-service';

interface TestConsentProvider extends TelemetryConsentProvider {
    setLevel(level: TelemetryLevel): void;
}

function createConsentProvider(initialLevel: TelemetryLevel): TestConsentProvider {
    const emitter = new Emitter<TelemetryLevel>();
    let level = initialLevel;
    return {
        get level(): TelemetryLevel {
            return level;
        },
        onDidChangeTelemetryLevel: emitter.event,
        setLevel: newLevel => {
            level = newLevel;
            emitter.fire(level);
        }
    };
}

function createRpc(events: TelemetryEvent[], failure?: Error, localSinkInterests: Promise<string[]> = Promise.resolve([])): TelemetryRpc {
    return {
        reportEvent: event => {
            events.push(event);
            return failure ? Promise.reject(failure) : Promise.resolve();
        },
        getLocalSinkInterests: () => localSinkInterests
    };
}

describe('BrowserTelemetryService', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers({ now: 1234 });
    });

    afterEach(() => clock.restore());

    it('assigns report-time timestamps and forwards valid events when allowed', () => {
        const events: TelemetryEvent[] = [];
        const service = new BrowserTelemetryService(createRpc(events), createConsentProvider('all'), new RecordingLogger());

        service.report('company/action', { enabled: true });
        clock.tick(10);
        service.report('company/other', { count: 3 });

        expect(events).to.have.length(2);
        expect(events[0]).to.deep.include({ topic: 'company/action', kind: 'usage', data: { enabled: true }, timestamp: 1234 });
        expect(events[1]).to.deep.include({ topic: 'company/other', kind: 'usage', data: { count: 3 }, timestamp: 1244 });
        expect(events[0].session).to.equal(events[1].session).and.not.empty;
    });

    it('forwards optimistically until local interests are ready, then applies consent and local interests', async () => {
        const events: TelemetryEvent[] = [];
        let resolveInterests: (interests: string[]) => void;
        const interests = new Promise<string[]>(resolve => resolveInterests = resolve);
        const consentProvider = createConsentProvider('off');
        const service = new BrowserTelemetryService(createRpc(events, undefined, interests), consentProvider, new RecordingLogger());

        service.report('company/optimistic');
        resolveInterests!(['company/local/*']);
        await interests;
        await Promise.resolve();
        service.report('company/remote');
        service.report('company/local/action');
        consentProvider.setLevel('all');
        service.report('company/enabled');

        expect(events.map(event => event.topic)).to.deep.equal(['company/optimistic', 'company/local/action', 'company/enabled']);
    });

    it('fetches local interests once and treats RPC failure as no local interests', async () => {
        const events: TelemetryEvent[] = [];
        const rpc = createRpc(events, undefined, Promise.reject(new Error('connection failed')));
        const getLocalSinkInterests = sinon.spy(rpc, 'getLocalSinkInterests');
        const service = new BrowserTelemetryService(rpc, createConsentProvider('off'), new RecordingLogger());

        service.report('company/optimistic');
        await Promise.resolve();
        await Promise.resolve();
        service.report('company/dropped');

        expect(getLocalSinkInterests.calledOnce).to.be.true;
        expect(events.map(event => event.topic)).to.deep.equal(['company/optimistic']);
    });

    it('forwards immutable snapshots of data and attributes with report options', () => {
        const events: TelemetryEvent[] = [];
        const service = new BrowserTelemetryService(createRpc(events), createConsentProvider('all'), new RecordingLogger());
        const data = {
            text: 'value',
            count: 3,
            enabled: true,
            strings: ['first', 'second'],
            numbers: [1, 2],
            booleans: [true, false],
            empty: [] as string[]
        };

        const attributes = { source: 'browser', labels: ['stable'] };
        service.report('company/action', data, { kind: 'error', attributes });

        expect(events).to.have.length(1);
        expect(events[0].kind).to.equal('error');
        expect(events[0].session).to.be.a('string').and.not.empty;
        expect(events[0].data).to.deep.equal(data);
        expect(events[0].attributes).to.deep.equal(attributes);
        expect(events[0].attributes).not.to.equal(attributes);
        expect(events[0].attributes?.labels).not.to.equal(attributes.labels);
        expect(events[0].data).not.to.equal(data);
        expect(events[0].data?.strings).not.to.equal(data.strings);
        expect(events[0].data?.numbers).not.to.equal(data.numbers);
        expect(events[0].data?.booleans).not.to.equal(data.booleans);
        expect(events[0].data?.empty).not.to.equal(data.empty);
        expect(Object.isFrozen(events[0].data)).to.be.true;
        expect(Object.isFrozen(events[0].data?.strings)).to.be.true;
        expect(Object.isFrozen(events[0].attributes)).to.be.true;
        expect(Object.isFrozen(events[0].attributes?.labels)).to.be.true;

        data.text = 'changed';
        attributes.source = 'changed';
        attributes.labels.push('changed');
        data.strings.push('changed');
        expect(events[0].data?.text).to.equal('value');
        expect(events[0].data?.strings).to.deep.equal(['first', 'second']);
        expect(events[0].attributes).to.deep.equal({ source: 'browser', labels: ['stable'] });
    });

    it('does not forward invalid topics or payloads', () => {
        const events: TelemetryEvent[] = [];
        const logger = new RecordingLogger();
        const service = new BrowserTelemetryService(createRpc(events), createConsentProvider('all'), logger);
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
        service.report('company/action', undefined, { kind: 'invalid' as never });
        service.report('company/action', undefined, { attributes: { nested: {} } as never });

        expect(events).to.be.empty;
        expect(logger.warnings).to.have.length(invalidCases.length + 2);
    });

    it('contains RPC rejection and does not log payload values', async () => {
        const events: TelemetryEvent[] = [];
        const logger = new RecordingLogger();
        const service = new BrowserTelemetryService(createRpc(events, new Error('connection failed')), createConsentProvider('all'), logger);
        const secret = 'sensitive-payload-value';

        expect(() => service.report('company/action', { secret })).not.to.throw();
        await Promise.resolve();

        expect(events).to.have.length(1);
        expect(logger.errors).to.deep.equal(["Failed to report telemetry event for topic 'company/action'."]);
        expect(logger.errors.join(' ')).not.to.contain(secret);
    });
});
