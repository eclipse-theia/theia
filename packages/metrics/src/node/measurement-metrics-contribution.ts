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
import { inject, injectable } from '@theia/core/shared/inversify';
import { MetricsContribution } from './metrics-contribution';
import { MeasurementResult, Stopwatch } from '@theia/core';
import { MeasurementNotificationService } from '../common';

const backendId = 'backend';
const metricsName = 'theia_measurements';

@injectable()
export class MeasurementMetricsContribution implements MetricsContribution, MeasurementNotificationService {
    @inject(Stopwatch)
    protected backendStopwatch: Stopwatch;

    protected metrics = '';
    protected frontendCounter = new Map<string, string>();

    startCollecting(): void {
        this.metrics += `# HELP ${metricsName} Theia stopwatch measurement results.\n`;
        this.metrics += `# TYPE ${metricsName} gauge\n`;
        this.backendStopwatch.onMeasurementResult(result => this.onBackendMeasurement(result));
    }

    getMetrics(): string {
        return this.metrics;
    }

    protected appendMetricsValue(id: string, result: MeasurementResult): void {
        const { name, elapsed, startTime, context, owner } = result;
        const labels: string = `id="${id}", name="${name}" ,startTime="${startTime}", elapsed="${elapsed}", owner="${owner}", context="${context}"`;
        const metricsValue = `${metricsName}{${labels}} ${elapsed}`;
        this.metrics += (metricsValue + '\n');
    }

    protected onBackendMeasurement(result: MeasurementResult): void {
        this.appendMetricsValue(backendId, result);
    }

    protected createFrontendCounterId(frontendId: string): string {
        const counterId = `frontend-${this.frontendCounter.size + 1}`;
        this.frontendCounter.set(frontendId, counterId);
        return counterId;
    }

    protected toCounterId(frontendId: string): string {
        return this.frontendCounter.get(frontendId) ?? this.createFrontendCounterId(frontendId);
    }

    onFrontendMeasurement(frontendId: string, result: MeasurementResult): void {
        this.appendMetricsValue(this.toCounterId(frontendId), result);
    }

}
