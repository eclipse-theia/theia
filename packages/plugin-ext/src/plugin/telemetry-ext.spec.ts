// *****************************************************************************
// Copyright (C) 2026 suzunn and others.
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

import * as chai from 'chai';
import { TelemetryLevel } from '@theia/telemetry/lib/common/telemetry-types';
import { TelemetryExtImpl } from './telemetry-ext';

const expect = chai.expect;

describe('TelemetryExtImpl', () => {
    const sender = {
        sendEventData: () => { },
        sendErrorData: () => { }
    };

    interface Expectation {
        isTelemetryEnabled: boolean;
        isUsageEnabled: boolean;
        isErrorsEnabled: boolean;
    }

    const expectations: Record<TelemetryLevel, Expectation> = {
        off: { isTelemetryEnabled: false, isUsageEnabled: false, isErrorsEnabled: false },
        crash: { isTelemetryEnabled: false, isUsageEnabled: false, isErrorsEnabled: false },
        error: { isTelemetryEnabled: false, isUsageEnabled: false, isErrorsEnabled: true },
        all: { isTelemetryEnabled: true, isUsageEnabled: true, isErrorsEnabled: true }
    };

    for (const level of ['off', 'crash', 'error', 'all'] as const) {
        const expected = expectations[level];

        it(`derives the enablement states from telemetry level '${level}'`, () => {
            const telemetry = new TelemetryExtImpl();
            telemetry.$setTelemetryLevel(level);
            const logger = telemetry.createTelemetryLogger(sender);

            expect(telemetry.level).to.equal(level);
            expect(telemetry.isTelemetryEnabled).to.equal(expected.isTelemetryEnabled);
            expect(logger.isUsageEnabled).to.equal(expected.isUsageEnabled);
            expect(logger.isErrorsEnabled).to.equal(expected.isErrorsEnabled);
        });

        it(`applies telemetry level '${level}' to loggers created before the level arrived`, () => {
            const telemetry = new TelemetryExtImpl();
            const logger = telemetry.createTelemetryLogger(sender);
            telemetry.$setTelemetryLevel(level);

            expect(logger.isUsageEnabled).to.equal(expected.isUsageEnabled);
            expect(logger.isErrorsEnabled).to.equal(expected.isErrorsEnabled);
        });
    }

    it('only fires onDidChangeTelemetryEnabled when the boolean it reports changes', () => {
        const telemetry = new TelemetryExtImpl();
        const fired: boolean[] = [];
        telemetry.onDidChangeTelemetryEnabled(enabled => fired.push(enabled));

        telemetry.$setTelemetryLevel('crash');
        telemetry.$setTelemetryLevel('error');
        telemetry.$setTelemetryLevel('all');
        telemetry.$setTelemetryLevel('off');

        expect(fired).to.deep.equal([true, false]);
    });

    it('fires onDidChangeEnableStates once per transition that changes an enablement state', () => {
        const telemetry = new TelemetryExtImpl();
        const logger = telemetry.createTelemetryLogger(sender);
        let changes = 0;
        logger.onDidChangeEnableStates(() => changes++);

        telemetry.$setTelemetryLevel('crash'); // off -> crash: both stay false
        expect(changes).to.equal(0);

        telemetry.$setTelemetryLevel('error'); // errors become enabled
        expect(changes).to.equal(1);

        telemetry.$setTelemetryLevel('all'); // usage becomes enabled
        expect(changes).to.equal(2);

        telemetry.$setTelemetryLevel('off');
        expect(changes).to.equal(3);
    });

    it('stops following the level once the logger is disposed', () => {
        const telemetry = new TelemetryExtImpl();
        const logger = telemetry.createTelemetryLogger(sender);
        let changes = 0;
        logger.onDidChangeEnableStates(() => changes++);

        logger.dispose();
        telemetry.$setTelemetryLevel('all');

        expect(logger.isUsageEnabled).to.equal(false);
        expect(changes).to.equal(0);
    });

    it('ignores a repeated telemetry level', () => {
        const telemetry = new TelemetryExtImpl();
        const logger = telemetry.createTelemetryLogger(sender);
        let changes = 0;
        logger.onDidChangeEnableStates(() => changes++);

        telemetry.$setTelemetryLevel('all');
        telemetry.$setTelemetryLevel('all');

        expect(changes).to.equal(1);
    });
});

describe('TelemetryLogger', () => {

    interface RecordingSender {
        events: string[];
        errors: Error[];
        sendEventData(eventName: string): void;
        sendErrorData(error: Error): void;
    }

    function createSender(): RecordingSender {
        const events: string[] = [];
        const errors: Error[] = [];
        return {
            events,
            errors,
            sendEventData: (eventName: string) => events.push(eventName),
            sendErrorData: (error: Error) => errors.push(error)
        };
    }

    it('delivers errors but suppresses usage at telemetry level \'error\'', () => {
        const telemetry = new TelemetryExtImpl();
        telemetry.$setTelemetryLevel('error');
        const sender = createSender();
        const logger = telemetry.createTelemetryLogger(sender);

        logger.logUsage('usage-event');
        logger.logError('error-event');
        logger.logError(new Error('boom'));

        expect(sender.events).to.deep.equal(['error-event']);
        expect(sender.errors).to.have.lengthOf(1);
    });

    it('suppresses usage that a plugin re-enables while the telemetry level forbids it', () => {
        const telemetry = new TelemetryExtImpl();
        telemetry.$setTelemetryLevel('off');
        const sender = createSender();
        const logger = telemetry.createTelemetryLogger(sender);

        logger.isUsageEnabled = true;
        logger.isErrorsEnabled = true;
        logger.logUsage('usage-event');
        logger.logError('error-event');

        expect(sender.events).to.be.empty;
    });
});
