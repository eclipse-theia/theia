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

import { inject, injectable, unmanaged } from 'inversify';
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

    constructor(@unmanaged() protected readonly defaultLogOptions: LogOptions) {
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

        const origin = options.owner ?? 'application';
        const timeFromStart = `${(options.now() / 1000).toFixed(3)} s since ${origin} start`;
        const whatWasMeasured = options.context ? `[${options.context}] ${activity}` : activity;
        this.logger.log(level, `${whatWasMeasured}: ${elapsed.toFixed(1)} ms [${timeFromStart}]`, ...(options.arguments ?? []));
    }

    get storedMeasurements(): ReadonlyArray<MeasurementResult> {
        return this._storedMeasurements;
    }

}

interface SettlementEntry {
    name: string;
    measurement: Measurement;
    pending: number;
    total: number;
}

/**
 * Tracks the settlement of async work initiated by contributions during application startup.
 *
 * A contribution "settles" when all promises it returned from lifecycle methods (initialize, configure, onStart, etc.)
 * have resolved. Individual settlement is only logged when a contribution returned promises from more than one lifecycle
 * method; otherwise the single lifecycle measurement already describes the work. An aggregate "all settled" message is
 * logged once all tracked promises across all contributions have resolved.
 *
 * Typical usage:
 * 1. Create the context at the start of the application lifecycle.
 * 2. Before each lifecycle call, call {@link ensureEntry} to start the per-contribution clock.
 * 3. After each lifecycle call, call {@link trackSettlement} with the return value.
 * 4. After the startup sequence completes, call {@link armAllSettled} to enable the aggregate message.
 */
export class MeasurementContext<T extends object = object> {

    private readonly entries = new Map<T, SettlementEntry>();
    private readonly allSettledMeasurement: Measurement;
    private allSettledPending = 0;
    private allSettledArmed = false;

    constructor(
        protected readonly stopwatch: Stopwatch,
        protected readonly owner: string,
        protected readonly thresholdMillis: number
    ) {
        this.allSettledMeasurement = this.stopwatch.start(`${owner.toLowerCase()}-all-settled`);
    }

    /**
     * Ensure that settlement tracking has been started for the given contribution.
     * Starts the per-contribution measurement clock on the first call for each contribution.
     */
    ensureEntry(item: T): void {
        if (!this.entries.has(item)) {
            const name = item.constructor.name;
            this.entries.set(item, {
                name,
                measurement: this.stopwatch.start(`${name}.settled`, { thresholdMillis: this.thresholdMillis }),
                pending: 0,
                total: 0
            });
        }
    }

    /**
     * Track a promise returned by a contribution's lifecycle method.
     * Must be called after the corresponding {@link Stopwatch.startAsync} has completed so that
     * the settlement log appears after the lifecycle measurement log.
     */
    trackSettlement(item: T, result: MaybePromise<unknown>): void {
        if (result instanceof Promise) {
            const entry = this.entries.get(item)!;
            entry.pending++;
            entry.total++;
            this.allSettledPending++;
            const onSettled = (): void => {
                this.onPromiseSettled(item);
            };
            result.then(onSettled, onSettled);
        }
    }

    /**
     * Arm the aggregate "all settled" log message. Call this after the startup sequence has finished
     * collecting all promises. If all promises have already settled, the message is logged immediately.
     */
    armAllSettled(): void {
        this.allSettledArmed = true;
        if (this.allSettledPending === 0) {
            this.allSettledMeasurement.info(`All ${this.owner.toLowerCase()} contributions settled`);
        }
    }

    private onPromiseSettled(item: T): void {
        const entry = this.entries.get(item);
        if (entry && --entry.pending === 0) {
            const { name, measurement, total } = entry;
            this.entries.delete(item);
            if (total > 1) {
                if (measurement.stop() > this.thresholdMillis) {
                    measurement.warn(`${this.owner} ${name} took longer than expected to settle`);
                } else {
                    measurement.debug(`${this.owner} ${name} settled`);
                }
            }
        }
        if (--this.allSettledPending === 0 && this.allSettledArmed) {
            this.allSettledMeasurement.info(`All ${this.owner.toLowerCase()} contributions settled`);
        }
    }

}
