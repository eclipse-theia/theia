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

import { MeasurementResult } from '@theia/core';
import { TelemetryService } from '@theia/telemetry/lib/common';

export const MEASUREMENT_TELEMETRY_TOPIC = 'theia/measurement/result';

export function reportMeasurement(telemetryService: TelemetryService, result: MeasurementResult): void {
    const { name, startTime, elapsed, owner } = result;
    if (owner === undefined) {
        telemetryService.report(MEASUREMENT_TELEMETRY_TOPIC, { name, startTime, elapsed });
    } else {
        telemetryService.report(MEASUREMENT_TELEMETRY_TOPIC, { name, startTime, elapsed, owner });
    }
}
