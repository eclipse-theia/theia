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

import { LogLevel, MeasurementResult, Stopwatch } from '@theia/core';
import { BackendApplicationContribution } from '@theia/core/lib/node';
import { LogLevelCliContribution } from '@theia/core/lib/node/logger-cli-contribution';
import { inject, injectable } from '@theia/core/shared/inversify';
import { TelemetryService } from '@theia/telemetry/lib/common';

@injectable()
export class MeasurementTelemetryContribution implements BackendApplicationContribution {
    @inject(Stopwatch)
    protected stopwatch: Stopwatch;

    @inject(LogLevelCliContribution)
    protected logLevelCli: LogLevelCliContribution;

    @inject(TelemetryService)
    protected telemetryService: TelemetryService;

    onStart(): void {
        if (this.logLevelCli.defaultLogLevel !== LogLevel.DEBUG) {
            return;
        }
        this.stopwatch.storedMeasurements.forEach(result => this.report(result));
        this.stopwatch.onDidAddMeasurementResult(result => this.report(result));
    }

    protected report(result: MeasurementResult): void {
        const { name, startTime, elapsed, owner } = result;
        if (owner === undefined) {
            this.telemetryService.report('theia/measurement/result', { name, startTime, elapsed });
        } else {
            this.telemetryService.report('theia/measurement/result', { name, startTime, elapsed, owner });
        }
    }
}
