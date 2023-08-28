/********************************************************************************
* Copyright (c) 2021 STMicroelectronics and others.
*
* This program and the accompanying materials are made available under the
* terms of the Eclipse Public License 2.0 which is available at
* http://www.eclipse.org/legal/epl-2.0.
*
* This Source Code may also be made available under the following Secondary
* Licenses when the conditions for such availability set forth in the Eclipse
* Public License v. 2.0 are satisfied: GNU General Public License, version 2
* with the GNU Classpath Exception which is available at
* https://www.gnu.org/software/classpath/license.html.
*
* SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
*******************************************************************************/

/* eslint-disable @typescript-eslint/no-explicit-any */

import { inject, injectable } from 'inversify';
import { ILogger, LogLevel } from '../logger';
import { MaybePromise } from '../types';
import { Measurement, MeasurementOptions, MeasurementResult } from './measurement';
import { Emitter, Event } from '../event';

/** The default log level for measurements that are not otherwise configured with a default. */
const DEFAULT_LOG_LEVEL = LogLevel.INFO;

/**
 * Configuration of the log messages written by a {@link Measurement}.
 */
interface LogOptions extends MeasurementOptions {
    /** A function that computes the current time, in millis, since the start of the application. */
    now: () => number;

    /** An optional label for the application the start of which (in real time) is the basis of all measurements. */
    owner?: string;

    /** An optional log level to override any default or dynamic log level for a specific log message. */
    levelOverride?: LogLevel;

    /** Optional arguments to the log message. The 'optionalArgs' coming in from the {@link Measurement} API are slotted in here. */
    arguments?: any[];
}

/**
 * A factory of {@link Measurement}s for performance logging.
 */
@injectable()
export abstract class Stopwatch {

    @inject(ILogger)
    protected readonly logger: ILogger;

    protected _storedMeasurements: MeasurementResult[] = [];

    protected onDidAddMeasurementResultEmitter = new Emitter<MeasurementResult>();
    get onDidAddMeasurementResult(): Event<MeasurementResult> {
        return this.onDidAddMeasurementResultEmitter.event;
    }

    constructor(protected readonly defaultLogOptions: LogOptions) {
        if (!defaultLogOptions.defaultLogLevel) {
            defaultLogOptions.defaultLogLevel = DEFAULT_LOG_LEVEL;
        }
        if (defaultLogOptions.storeResults === undefined) {
            defaultLogOptions.storeResults = true;
        }
    }

    /**
     * Create a {@link Measurement} that will compute its elapsed time when logged.
     *
     * @param name the {@link Measurement.name measurement name}
     * @param options optional configuration of the new measurement
     * @returns a self-timing measurement
     */
    public abstract start(name: string, options?: MeasurementOptions): Measurement;

    /**
     * Wrap an asynchronous function in a {@link Measurement} that logs itself on completion.
     * If obtaining and awaiting the `computation` runs too long according to the threshold
     * set in the `options`, then the log message is a warning, otherwise a debug log.
     *
     * @param name the {@link Measurement.name name of the measurement} to wrap around the function
     * @param description a description of what the function does, to be included in the log
     * @param computation a supplier of the asynchronous function to wrap
     * @param options optional addition configuration as for {@link measure}
     * @returns the wrapped `computation`
     *
     * @see {@link MeasurementOptions.thresholdMillis}
     */
    public async startAsync<T>(name: string, description: string, computation: () => MaybePromise<T>, options?: MeasurementOptions): Promise<T> {
        const threshold = options?.thresholdMillis ?? Number.POSITIVE_INFINITY;

        const measure = this.start(name, options);
        const result = await computation();
        if (measure.stop() > threshold) {
            measure.warn(`${description} took longer than the expected maximum ${threshold} milliseconds`);
        } else {
            measure.log(description);
        }
        return result;
    }

    protected createMeasurement(name: string, measure: () => { startTime: number, duration: number }, options?: MeasurementOptions): Measurement {
        const logOptions = this.mergeLogOptions(options);

        const measurement: Measurement = {
            name,
            stop: () => {
                if (measurement.elapsed === undefined) {
                    const { startTime, duration } = measure();
                    measurement.elapsed = duration;
                    const result: MeasurementResult = {
                        name,
                        elapsed: duration,
                        startTime,
                        owner: logOptions.owner
                    };
                    if (logOptions.storeResults) {
                        this._storedMeasurements.push(result);
                    }
                    this.onDidAddMeasurementResultEmitter.fire(result);
                }
                return measurement.elapsed;
            },
            log: (activity: string, ...optionalArgs: any[]) => this.log(measurement, activity, this.atLevel(logOptions, undefined, optionalArgs)),
            debug: (activity: string, ...optionalArgs: any[]) => this.log(measurement, activity, this.atLevel(logOptions, LogLevel.DEBUG, optionalArgs)),
            info: (activity: string, ...optionalArgs: any[]) => this.log(measurement, activity, this.atLevel(logOptions, LogLevel.INFO, optionalArgs)),
            warn: (activity: string, ...optionalArgs: any[]) => this.log(measurement, activity, this.atLevel(logOptions, LogLevel.WARN, optionalArgs)),
            error: (activity: string, ...optionalArgs: any[]) => this.log(measurement, activity, this.atLevel(logOptions, LogLevel.ERROR, optionalArgs)),
        };

        return measurement;
    }

    protected mergeLogOptions(logOptions?: Partial<LogOptions>): LogOptions {
        const result: LogOptions = { ...this.defaultLogOptions };
        if (logOptions) {
            Object.assign(result, logOptions);
        }
        return result;
    }

    protected atLevel(logOptions: LogOptions, levelOverride?: LogLevel, optionalArgs?: any[]): LogOptions {
        return { ...logOptions, levelOverride, arguments: optionalArgs };
    }

    protected logLevel(elapsed: number, options?: Partial<LogOptions>): LogLevel {
        if (options?.levelOverride) {
            return options.levelOverride;
        }

        return options?.defaultLogLevel ?? this.defaultLogOptions.defaultLogLevel ?? DEFAULT_LOG_LEVEL;
    }

    protected log(measurement: Measurement, activity: string, options: LogOptions): void {
        const elapsed = measurement.stop();
        const level = this.logLevel(elapsed, options);

        if (Number.isNaN(elapsed)) {
            switch (level) {
                case LogLevel.ERROR:
                case LogLevel.FATAL:
                    // Always log errors, even if NaN duration from native API preventing a measurement
                    break;
                default:
                    // Measurement was prevented by native API, do not log NaN duration
                    return;
            }
        }

        const start = options.owner ? `${options.owner} start` : 'start';
        const timeFromStart = `Finished ${(options.now() / 1000).toFixed(3)} s after ${start}`;
        const whatWasMeasured = options.context ? `[${options.context}] ${activity}` : activity;
        this.logger.log(level, `${whatWasMeasured}: ${elapsed.toFixed(1)} ms [${timeFromStart}]`, ...(options.arguments ?? []));
    }

    get storedMeasurements(): ReadonlyArray<MeasurementResult> {
        return this._storedMeasurements;
    }

}
