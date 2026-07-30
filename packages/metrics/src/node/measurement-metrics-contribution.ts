// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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
import { LogLevel, MeasurementResult } from '@theia/core';
import { LogLevelCliContribution } from '@theia/core/lib/node/logger-cli-contribution';
import { inject, injectable } from '@theia/core/shared/inversify';
import { BACKEND_TELEMETRY_SESSION, TelemetryEvent } from '@theia/telemetry/lib/common';
import { TelemetrySink } from '@theia/telemetry/lib/node';
import { MetricsContribution } from './metrics-contribution';

const metricsName = 'theia_measurements';

@injectable()
export class MeasurementMetricsBackendContribution implements MetricsContribution, TelemetrySink {
    readonly id = 'theia/measurements';
    readonly interests: readonly string[] = ['theia/measurement/*'];
    readonly scope: 'local' | 'remote' = 'local';

    @inject(LogLevelCliContribution)
    protected logLevelCli: LogLevelCliContribution;

    protected metrics = '';
    protected frontendCounters = new Map<string, string>();

    startCollecting(): void {
        if (!this.isEnabled()) {
            return;
        }
        this.metrics += `# HELP ${metricsName} Theia stopwatch measurement results.\n`;
        this.metrics += `# TYPE ${metricsName} gauge\n`;
    }

    getMetrics(): string {
        return this.metrics;
    }

    handle(event: TelemetryEvent): void {
        if (!this.isEnabled()) {
            return;
        }
        const result = this.toMeasurementResult(event);
        if (!result) {
            return;
        }
        if (event.session === BACKEND_TELEMETRY_SESSION) {
            this.onBackendMeasurement(result);
        } else {
            this.onFrontendMeasurement(event.session, result);
        }
    }

    protected onBackendMeasurement(result: MeasurementResult): void {
        this.appendMetricsValue(BACKEND_TELEMETRY_SESSION, result);
    }

    protected isEnabled(): boolean {
        return this.logLevelCli.defaultLogLevel === LogLevel.DEBUG;
    }

    protected toMeasurementResult(event: TelemetryEvent): MeasurementResult | undefined {
        const data = event.data;
        if (!data || typeof data.name !== 'string' || typeof data.startTime !== 'number' || typeof data.elapsed !== 'number'
            || data.owner !== undefined && typeof data.owner !== 'string') {
            return undefined;
        }
        return {
            name: data.name,
            startTime: data.startTime,
            elapsed: data.elapsed,
            ...(data.owner === undefined ? {} : { owner: data.owner })
        };
    }

    protected appendMetricsValue(id: string, result: MeasurementResult): void {
        const { name, elapsed, startTime, owner } = result;
        const labels: string = `id="${id}", name="${name}", startTime="${startTime}", owner="${owner}"`;
        const metricsValue = `${metricsName}{${labels}} ${elapsed}`;
        this.metrics += (metricsValue + '\n');
    }

    protected createFrontendCounterId(frontendId: string): string {
        const counterId = `frontend-${this.frontendCounters.size + 1}`;
        this.frontendCounters.set(frontendId, counterId);
        return counterId;
    }

    protected toCounterId(frontendId: string): string {
        return this.frontendCounters.get(frontendId) ?? this.createFrontendCounterId(frontendId);
    }

    onFrontendMeasurement(frontendId: string, result: MeasurementResult): void {
        this.appendMetricsValue(this.toCounterId(frontendId), result);
    }
}
