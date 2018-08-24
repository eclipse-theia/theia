/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import { LoggerWatcher } from './logger-watcher';
import { ILoggerServer, LogLevel, ConsoleLogger, rootLoggerName } from './logger-protocol';

// tslint:disable:no-any

export {
    LogLevel, rootLoggerName
};

/* This is to be initialized from container composition root. It can be used outside of the inversify context.  */
export let logger: ILogger;

/**
 * Counterpart of the `#setRootLogger(ILogger)`. Restores the `console.xxx` bindings to the original one.
 * Invoking has no side-effect if `setRootLogger` was not called before. Multiple function invocation has
 * no side-effect either.
 */
export function unsetRootLogger() {
    if (logger !== undefined) {
        ConsoleLogger.reset();
        (<any>logger) = undefined;
    }
}

export function setRootLogger(aLogger: ILogger): void {
    logger = aLogger;
    const log = (logLevel: number, message?: any, ...optionalParams: any[]) =>
        logger.log(logLevel, message, ...optionalParams);

    console.error = log.bind(undefined, LogLevel.ERROR);
    console.warn = log.bind(undefined, LogLevel.WARN);
    console.info = log.bind(undefined, LogLevel.INFO);
    console.debug = log.bind(undefined, LogLevel.DEBUG);
    console.trace = log.bind(undefined, LogLevel.TRACE);
    console.log = log.bind(undefined, LogLevel.INFO);
}

export type Log = (message: any, ...params: any[]) => void;
export type Loggable = (log: Log) => void;

export const LoggerFactory = Symbol('LoggerFactory');
export type LoggerFactory = (name: string) => ILogger;

export const LoggerName = Symbol('LoggerName');

export const ILogger = Symbol('ILogger');

export interface ILogger {
    /**
     * Set the log level.
     *
     * @param loglevel - The loglevel to set. see Logger.LogLevel for
     * possible options.
     */
    setLogLevel(logLevel: number): Promise<void>
    /**
     * Get the log level.
     *
     * @returns a Promise to the log level.
     */
    getLogLevel(): Promise<number>;

    /**
     * Test whether the given log level is enabled.
     */
    isEnabled(logLevel: number): Promise<boolean>;
    /**
     * Resolve if the given log is enabled.
     */
    ifEnabled(logLevel: number): Promise<void>;
    /**
     * Log a loggable with the given level if it is enabled.
     */
    log(logLevel: number, loggable: Loggable): Promise<void>;
    /**
     * Log a message with the given level if it is enabled.
     *
     * @param logLevel - The loglevel to use.
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    log(logLevel: number, message: any, ...params: any[]): void;

    /**
     * Test whether the trace level is enabled.
     */
    isTrace(): Promise<boolean>;
    /**
     * Resolve if the trace level is enabled.
     */
    ifTrace(): Promise<void>;
    /**
     * Log a loggable with the trace level if it is enabled.
     */
    trace(loggable: Loggable): Promise<void>;
    /**
     * Log a message with the trace level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    trace(message: any, ...params: any[]): Promise<void>;

    /**
     * Test whether the debug level is enabled.
     */
    isDebug(): Promise<boolean>;
    /**
     * Resolve if the debug level is enabled.
     */
    ifDebug(): Promise<void>;
    /**
     * Log a loggable with the debug level if it is enabled.
     */
    debug(loggable: Loggable): Promise<void>;
    /**
     * Log a message with the debug level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    debug(message: any, ...params: any[]): Promise<void>;

    /**
     * Test whether the info level is enabled.
     */
    isInfo(): Promise<boolean>;
    /**
     * Resolve if the info level is enabled.
     */
    ifInfo(): Promise<void>;
    /**
     * Log a loggable with the info level if it is enabled.
     */
    info(loggable: Loggable): Promise<void>;
    /**
     * Log a message with the info level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    info(message: any, ...params: any[]): Promise<void>;

    /**
     * Test whether the warn level is enabled.
     */
    isWarn(): Promise<boolean>;
    /**
     * Resolve if the warn level is enabled.
     */
    ifWarn(): Promise<void>;
    /**
     * Log a loggable with the warn level if it is enabled.
     */
    warn(loggable: Loggable): Promise<void>;
    /**
     * Log a message with the warn level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    warn(message: any, ...params: any[]): Promise<void>;

    /**
     * Test whether the error level is enabled.
     */
    isError(): Promise<boolean>;
    /**
     * Resolve if the error level is enabled.
     */
    ifError(): Promise<void>;
    /**
     * Log a loggable with the error level if it is enabled.
     */
    error(loggable: Loggable): Promise<void>;
    /**
     * Log a message with the error level.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    error(message: any, ...params: any[]): Promise<void>;

    /**
     * Test whether the fatal level is enabled.
     */
    isFatal(): Promise<boolean>;
    /**
     * Resolve if the fatal level is enabled.
     */
    ifFatal(): Promise<void>;
    /**
     * Log a loggable with the fatal level if it is enabled.
     */
    fatal(loggable: Loggable): Promise<void>;
    /**
     * Log a message with the fatal level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    fatal(message: any, ...params: any[]): Promise<void>;

    /**
     * Create a child logger from this logger.
     *
     * @param name - The name of the child logger.
     */
    child(name: string): ILogger;
}

@injectable()
export class Logger implements ILogger {

    /* Log level for the logger.  */
    protected _logLevel: Promise<number>;

    /* A promise resolved when the logger has been created by the backend.  */
    protected created: Promise<void>;

    /**
     * Build a new Logger.
     */
    constructor(
        @inject(ILoggerServer) protected readonly server: ILoggerServer,
        @inject(LoggerWatcher) protected readonly loggerWatcher: LoggerWatcher,
        @inject(LoggerFactory) protected readonly factory: LoggerFactory,
        @inject(LoggerName) protected name: string) {

        if (name !== rootLoggerName) {
            /* Creating a child logger.  */
            this.created = server.child(name);
        } else {
            /* Creating the root logger (it already exists at startup).  */
            this.created = Promise.resolve();
        }

        /* Fetch the log level so it's cached in the frontend.  */
        this._logLevel = this.created.then(_ => this.server.getLogLevel(name));

        /* Update the log level if it changes in the backend. */
        loggerWatcher.onLogLevelChanged(event => {
            this.created.then(() => {
                if (event.loggerName === name) {
                    this._logLevel = Promise.resolve(event.newLogLevel);
                }
            });
        });
    }

    setLogLevel(logLevel: number): Promise<void> {
        return new Promise<void>(resolve => {
            this.created.then(() => {
                this._logLevel.then(oldLevel => {
                    this.server.setLogLevel(this.name, logLevel).then(() => {
                        this._logLevel = Promise.resolve(logLevel);
                        resolve();
                    });
                });
            });
        });
    }
    getLogLevel(): Promise<number> {
        return this._logLevel;
    }

    isEnabled(logLevel: number): Promise<boolean> {
        return this._logLevel.then(level =>
            logLevel >= level
        );
    }
    ifEnabled(logLevel: number): Promise<void> {
        return new Promise<void>(resolve =>
            this.isEnabled(logLevel).then(enabled => {
                if (enabled) {
                    resolve();
                }
            })
        );
    }
    log(logLevel: number, arg2: any | Loggable, ...params: any[]): Promise<void> {
        return this.getLog(logLevel).then(log => {
            if (typeof arg2 === 'function') {
                const loggable = arg2;
                loggable(log);
            } else if (arg2) {
                log(arg2, ...params);
            }
        });
    }
    protected getLog(logLevel: number): Promise<Log> {
        return this.ifEnabled(logLevel).then(() =>
            this.created.then(() =>
                (message: any, ...params: any[]) =>
                    this.server.log(this.name, logLevel, this.format(message), params.map(p => this.format(p)))
            )
        );
    }
    protected format(value: any): any {
        if (value instanceof Error) {
            return value.stack || value.toString();
        }
        return value;
    }

    isTrace(): Promise<boolean> {
        return this.isEnabled(LogLevel.TRACE);
    }
    ifTrace(): Promise<void> {
        return this.ifEnabled(LogLevel.TRACE);
    }
    trace(arg: any | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.TRACE, arg, ...params);
    }

    isDebug(): Promise<boolean> {
        return this.isEnabled(LogLevel.DEBUG);
    }
    ifDebug(): Promise<void> {
        return this.ifEnabled(LogLevel.DEBUG);
    }
    debug(arg: any | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.DEBUG, arg, ...params);
    }

    isInfo(): Promise<boolean> {
        return this.isEnabled(LogLevel.INFO);
    }
    ifInfo(): Promise<void> {
        return this.ifEnabled(LogLevel.INFO);
    }
    info(arg: any | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.INFO, arg, ...params);
    }

    isWarn(): Promise<boolean> {
        return this.isEnabled(LogLevel.WARN);
    }
    ifWarn(): Promise<void> {
        return this.ifEnabled(LogLevel.WARN);
    }
    warn(arg: any | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.WARN, arg, ...params);
    }

    isError(): Promise<boolean> {
        return this.isEnabled(LogLevel.ERROR);
    }
    ifError(): Promise<void> {
        return this.ifEnabled(LogLevel.ERROR);
    }
    error(arg: any | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.ERROR, arg, ...params);
    }

    isFatal(): Promise<boolean> {
        return this.isEnabled(LogLevel.FATAL);
    }
    ifFatal(): Promise<void> {
        return this.ifEnabled(LogLevel.FATAL);
    }
    fatal(arg: any | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.FATAL, arg, ...params);
    }

    child(name: string): ILogger {
        return this.factory(name);
    }
}
