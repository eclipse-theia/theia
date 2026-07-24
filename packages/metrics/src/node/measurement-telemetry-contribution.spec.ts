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

import { Emitter, LogLevel, MeasurementResult, Stopwatch } from '@theia/core';
import { TelemetryEvent, TelemetryService } from '@theia/telemetry/lib/common';
import { expect } from 'chai';
import { MeasurementMetricsBackendContribution } from './measurement-metrics-contribution';
import { MeasurementTelemetryContribution } from './measurement-telemetry-contribution';

const storedResult: MeasurementResult = {
    name: 'startup',
    startTime: 12,
    elapsed: 34
};

class TestMeasurementTelemetryContribution extends MeasurementTelemetryContribution {
    configure(stopwatch: Stopwatch, defaultLogLevel: LogLevel, telemetryService: TelemetryService): void {
        this.stopwatch = stopwatch;
        this.logLevelCli = { defaultLogLevel } as never;
        this.telemetryService = telemetryService;
    }
}

class TestMeasurementMetricsBackendContribution extends MeasurementMetricsBackendContribution {
    configure(defaultLogLevel: LogLevel): void {
        this.logLevelCli = { defaultLogLevel } as never;
    }
}

function createStopwatch(storedMeasurements: MeasurementResult[], emitter: Emitter<MeasurementResult>): Stopwatch {
    return {
        storedMeasurements,
        onDidAddMeasurementResult: emitter.event
    } as unknown as Stopwatch;
}

function createEvent(session: string, data: TelemetryEvent['data']): TelemetryEvent {
    return {
        topic: 'theia/measurement/result',
        kind: 'usage',
        data,
        session,
        timestamp: 1
    };
}

describe('measurement telemetry integration', () => {
    it('reports stored and new backend measurements at DEBUG level', () => {
        const reports: unknown[][] = [];
        const telemetryService: TelemetryService = {
            report: (topic, data, options) => reports.push([topic, data, options])
        };
        const emitter = new Emitter<MeasurementResult>();
        const contribution = new TestMeasurementTelemetryContribution();
        contribution.configure(createStopwatch([storedResult], emitter), LogLevel.DEBUG, telemetryService);

        contribution.onStart();
        emitter.fire({ ...storedResult, owner: 'backend' });

        expect(reports).to.deep.equal([
            ['theia/measurement/result', storedResult, undefined],
            ['theia/measurement/result', { ...storedResult, owner: 'backend' }, undefined]
        ]);
    });

    it('does not report backend measurements above DEBUG level', () => {
        const reports: unknown[][] = [];
        const telemetryService: TelemetryService = {
            report: (...args) => reports.push(args)
        };
        const emitter = new Emitter<MeasurementResult>();
        const contribution = new TestMeasurementTelemetryContribution();
        contribution.configure(createStopwatch([storedResult], emitter), LogLevel.INFO, telemetryService);

        contribution.onStart();
        emitter.fire(storedResult);

        expect(reports).to.be.empty;
    });

    it('converts telemetry sessions to backend and stable frontend counter IDs', () => {
        const contribution = new TestMeasurementMetricsBackendContribution();
        contribution.configure(LogLevel.DEBUG);
        contribution.startCollecting();

        contribution.handle(createEvent('backend', { name: 'startup', startTime: 12, elapsed: 34 }));
        contribution.handle(createEvent('session-a', { name: 'startup', startTime: 12, elapsed: 34 }));
        contribution.handle(createEvent('session-a', { ...storedResult, name: 'second' }));
        contribution.handle(createEvent('session-b', { name: 'startup', startTime: 12, elapsed: 34 }));

        const metrics = contribution.getMetrics();
        expect(metrics).to.contain('id="backend", name="startup"');
        expect(metrics).to.contain('id="frontend-1", name="startup"');
        expect(metrics).to.contain('id="frontend-1", name="second"');
        expect(metrics).to.contain('id="frontend-2", name="startup"');
    });

    it('keeps the deprecated frontend notification path mapped to frontend counters', () => {
        const contribution = new TestMeasurementMetricsBackendContribution();
        contribution.configure(LogLevel.DEBUG);
        contribution.startCollecting();

        contribution.onFrontendMeasurement('legacy-session', storedResult);
        contribution.onFrontendMeasurement('legacy-session', { ...storedResult, name: 'second' });

        const metrics = contribution.getMetrics();
        expect(metrics).to.contain('id="frontend-1", name="startup"');
        expect(metrics).to.contain('id="frontend-1", name="second"');
    });

    it('ignores malformed measurement payloads', () => {
        const contribution = new TestMeasurementMetricsBackendContribution();
        contribution.configure(LogLevel.DEBUG);
        contribution.startCollecting();
        const initialMetrics = contribution.getMetrics();

        contribution.handle(createEvent('session-a', { name: 'invalid' }));

        expect(contribution.getMetrics()).to.equal(initialMetrics);
    });
});
