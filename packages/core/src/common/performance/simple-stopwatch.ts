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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { LogLevel } from '../logger';
import { Measurement, MeasurementOptions } from './measurement';
import { Stopwatch } from './stopwatch';

/**
 * A simple {@link Stopwatch} that uses a caller-supplied time function and logs
 * via `console`. Usable without Inversify DI: this class does not assign nor
 * use the inherited `logger` field.
 */
export class SimpleStopwatch extends Stopwatch {

    constructor(owner: string, now: () => number) {
        super({ owner, now });
    }

    start(name: string, options?: MeasurementOptions): Measurement {
        const now = this.defaultLogOptions.now;
        const startTime = now();

        return this.createMeasurement(name, () => ({
            startTime,
            duration: now() - startTime
        }), options);
    }

    protected override log(measurement: Measurement, activity: string, options: {
        now: () => number;
        owner?: string;
        context?: string;
        arguments?: any[];
    } & MeasurementOptions): void {
        const elapsed = measurement.stop();
        const level = this.logLevel(elapsed, options);

        if (Number.isNaN(elapsed)) {
            switch (level) {
                case LogLevel.ERROR:
                case LogLevel.FATAL:
                    break;
                default:
                    return;
            }
        }

        const origin = options.owner ?? 'application';
        const timeFromStart = `${(options.now() / 1000).toFixed(3)} s since ${origin} start`;
        const whatWasMeasured = options.context ? `[${options.context}] ${activity}` : activity;
        const message = `${whatWasMeasured}: ${elapsed.toFixed(1)} ms [${timeFromStart}]`;
        const args = options.arguments ?? [];

        switch (level) {
            case LogLevel.FATAL:
            case LogLevel.ERROR:
                console.error(message, ...args);
                break;
            case LogLevel.WARN:
                console.warn(message, ...args);
                break;
            case LogLevel.INFO:
                console.info(message, ...args);
                break;
            case LogLevel.DEBUG:
                console.debug(message, ...args);
                break;
            case LogLevel.TRACE:
                console.trace(message, ...args);
                break;
            default:
                console.log(message, ...args);
                break;
        }
    }
}
