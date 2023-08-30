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

import { LogLevel } from '../logger';

/**
 * A `Measurement` counts the time elapsed between its creation when the {@link Stopwatch}
 * is {@link Stopwatch.start started} and when it is {@link stop stopped}.
 */
export interface Measurement {
    /**
     * Compute the elapsed time, in milliseconds, if not already done (only has effect on the first invocation).
     * A `NaN` result indicates that the watch was stopped but failed to make a measurement.
     */
    stop(): number;

    /** The measurement name. This may show up in the performance measurement framework appropriate to the application context. */
    name: string;

    /**
     * The elapsed time measured, if it has been {@link stop stopped} and measured, or `NaN` if the platform disabled
     * performance measurement.
     */
    elapsed?: number;

    /**
     * Compute the elapsed time and log a message annotated with that timing information.
     * The message is logged at the level determined by the {@link MeasurementOptions}.
     *
     * @param detail a message detailing what activity was measured
     * @param optionalArgs optional message arguments as per the usual console API
     */
    log(detail: string, ...optionalArgs: any[]): void;

    /**
     * Compute the elapsed time and log a debug message annotated with that timing information.
     *
     * @param detail a message detailing what activity was measured
     * @param optionalArgs optional message arguments as per the usual console API
     */
    debug(detail: string, ...optionalArgs: any[]): void;

    /**
     * Compute the elapsed time and log an info message annotated with that timing information.
     *
     * @param detail a message detailing what activity was measured
     * @param optionalArgs optional message arguments as per the usual console API
     */
    info(detail: string, ...optionalArgs: any[]): void;

    /**
     * Compute the elapsed time and log a warning message annotated with that timing information.
     *
     * @param detail a message detailing what activity was measured
     * @param optionalArgs optional message arguments as per the usual console API
     */
    warn(detail: string, ...optionalArgs: any[]): void;

    /**
     * Compute the elapsed time and log an error message annotated with that timing information.
     *
     * @param detail a message detailing what activity was measured
     * @param optionalArgs optional message arguments as per the usual console API
     */
    error(detail: string, ...optionalArgs: any[]): void;
}

/**
 * Optional configuration of a {@link Measurement} specified at the time of its creation.
 */
export interface MeasurementOptions {
    /**
     * A specific context of the application in which an activity was measured.
     * Results in logs being emitted with a "[<context>]" qualified at the head.
     */
    context?: string;

    /** An optional logging level at which to emit the log message. The default value is {@link LogLevel.INFO}. */
    defaultLogLevel?: LogLevel;

    /**
     * Some measurements are measured against a threshold (in millis) that they should not exceed.
     * If omitted, the implied threshold is unlimited time (no threshold).
     *
     * @see {@link Stopwatch.startAsync}
     * @see {@link thresholdLogLevel}
     */
    thresholdMillis?: number;

    /**
     * Flag to indicate whether the stopwatch should store measurement results for later retrieval.
     * For example the cache can be used to retrieve measurements which were taken during startup before a listener had a chance to register.
     */
    storeResults?: boolean
}

/**
 * Captures the result of a {@link Measurement} in a serializable format.
 */
export interface MeasurementResult {
    /** The measurement name. This may show up in the performance measurement framework appropriate to the application context. */
    name: string;

    /** The time when the measurement recording has been started */
    startTime: number;

    /**
     * The elapsed time measured, if it has been {@link stop stopped} and measured, or `NaN` if the platform disabled
     * performance measurement.
     */
    elapsed: number;

    /** An optional label for the application the start of which (in real time) is the basis of all measurements. */
    owner?: string;
}
