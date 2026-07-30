// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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
import { BACKEND_TELEMETRY_SESSION, TelemetryEvent, TelemetryService } from '@theia/telemetry/lib/common';
import { expect } from 'chai';
import { MEASUREMENT_TELEMETRY_TOPIC, reportMeasurement } from '../common';
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

class OverridingMeasurementMetricsBackendContribution extends TestMeasurementMetricsBackendContribution {
    readonly backendMeasurements: MeasurementResult[] = [];
    readonly frontendMeasurements: Array<[string, MeasurementResult]> = [];

    protected override onBackendMeasurement(result: MeasurementResult): void {
        this.backendMeasurements.push(result);
    }

    override onFrontendMeasurement(frontendId: string, result: MeasurementResult): void {
        this.frontendMeasurements.push([frontendId, result]);
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
        topic: MEASUREMENT_TELEMETRY_TOPIC,
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
            [MEASUREMENT_TELEMETRY_TOPIC, storedResult, undefined],
            [MEASUREMENT_TELEMETRY_TOPIC, { ...storedResult, owner: 'backend' }, undefined]
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

        contribution.handle(createEvent(BACKEND_TELEMETRY_SESSION, { name: 'startup', startTime: 12, elapsed: 34 }));
        contribution.handle(createEvent('frontend/session-a', { name: 'startup', startTime: 12, elapsed: 34 }));
        contribution.handle(createEvent('frontend/session-a', { ...storedResult, name: 'second' }));
        contribution.handle(createEvent('frontend/session-b', { name: 'startup', startTime: 12, elapsed: 34 }));

        const metrics = contribution.getMetrics();
        expect(metrics).to.contain('id="backend", name="startup"');
        expect(metrics).to.contain('id="frontend-1", name="startup"');
        expect(metrics).to.contain('id="frontend-1", name="second"');
        expect(metrics).to.contain('id="frontend-2", name="startup"');
    });

    it('does not append telemetry events above DEBUG level', () => {
        const contribution = new TestMeasurementMetricsBackendContribution();
        contribution.configure(LogLevel.INFO);
        contribution.startCollecting();

        contribution.handle(createEvent(BACKEND_TELEMETRY_SESSION, { ...storedResult }));

        expect(contribution.getMetrics()).to.equal('');
    });

    it('dispatches telemetry events through the backend and frontend extension points', () => {
        const contribution = new OverridingMeasurementMetricsBackendContribution();
        contribution.configure(LogLevel.DEBUG);
        const frontendResult = { ...storedResult, owner: 'frontend' };

        contribution.handle(createEvent(BACKEND_TELEMETRY_SESSION, { ...storedResult }));
        contribution.handle(createEvent('frontend/session-a', frontendResult));

        expect(contribution.backendMeasurements).to.deep.equal([storedResult]);
        expect(contribution.frontendMeasurements).to.deep.equal([['frontend/session-a', frontendResult]]);
    });

    it('reports measurement data with optional owner', () => {
        const reports: unknown[][] = [];
        const telemetryService: TelemetryService = {
            report: (topic, data, options) => reports.push([topic, data, options])
        };

        reportMeasurement(telemetryService, storedResult);
        reportMeasurement(telemetryService, { ...storedResult, owner: 'frontend' });

        expect(reports).to.deep.equal([
            [MEASUREMENT_TELEMETRY_TOPIC, storedResult, undefined],
            [MEASUREMENT_TELEMETRY_TOPIC, { ...storedResult, owner: 'frontend' }, undefined]
        ]);
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
