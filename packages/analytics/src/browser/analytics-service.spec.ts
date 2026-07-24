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
import * as sinon from 'sinon';
import { AnalyticsEvent, AnalyticsRpc } from '../common/analytics-protocol';
import { RecordingLogger } from '../common/test/recording-logger';
import { BrowserAnalyticsService } from './analytics-service';

function createRpc(events: AnalyticsEvent[], failure?: Error): AnalyticsRpc {
    return {
        reportEvent: event => {
            events.push(event);
            return failure ? Promise.reject(failure) : Promise.resolve();
        }
    };
}

describe('BrowserAnalyticsService', () => {
    let clock: sinon.SinonFakeTimers;

    beforeEach(() => {
        clock = sinon.useFakeTimers({ now: 1234 });
    });

    afterEach(() => clock.restore());

    it('assigns report-time timestamps and forwards valid events without policy evaluation', () => {
        const events: AnalyticsEvent[] = [];
        const service = new BrowserAnalyticsService(createRpc(events), new RecordingLogger());

        service.report('company/action', { enabled: true });
        clock.tick(10);
        service.report('company/other', { count: 3 });

        expect(events).to.deep.equal([
            { topic: 'company/action', data: { enabled: true }, timestamp: 1234 },
            { topic: 'company/other', data: { count: 3 }, timestamp: 1244 }
        ]);
    });

    it('forwards immutable snapshots of scalar and homogeneous array values', () => {
        const events: AnalyticsEvent[] = [];
        const service = new BrowserAnalyticsService(createRpc(events), new RecordingLogger());
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
        const events: AnalyticsEvent[] = [];
        const logger = new RecordingLogger();
        const service = new BrowserAnalyticsService(createRpc(events), logger);
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
        const events: AnalyticsEvent[] = [];
        const logger = new RecordingLogger();
        const service = new BrowserAnalyticsService(createRpc(events, new Error('connection failed')), logger);
        const secret = 'sensitive-payload-value';

        expect(() => service.report('company/action', { secret })).not.to.throw();
        await Promise.resolve();

        expect(events).to.have.length(1);
        expect(logger.errors).to.deep.equal(["Failed to report analytics event for topic 'company/action'."]);
        expect(logger.errors.join(' ')).not.to.contain(secret);
    });
});
