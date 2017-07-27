/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, optional } from 'inversify';
import { LoggerWatcher } from './logger-watcher';
import { ILoggerServer } from './logger-protocol';

export namespace LogLevel {
    export const FATAL = 60;
    export const ERROR = 50;
    export const WARN = 40;
    export const INFO = 30;
    export const DEBUG = 20;
    export const TRACE = 10;
}

export type Log = (message: string, ...params: any[]) => void;
export type Loggable = (log: Log) => void;

export const LoggerFactory = Symbol('LoggerFactory')
export type LoggerFactory = (options?: object) => ILogger;

export const LoggerOptions = Symbol('LoggerOptions')

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
    log(logLevel: number, loggable: Loggable): void;
    /**
     * Log a message with the given level if it is enabled.
     *
     * @param logLevel - The loglevel to use.
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    log(logLevel: number, message: string, ...params: any[]): void;

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
    trace(loggable: Loggable): void;
    /**
     * Log a message with the trace level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    trace(message: string, ...params: any[]): void;

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
    debug(loggable: Loggable): void;
    /**
     * Log a message with the debug level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    debug(message: string, ...params: any[]): void;

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
    info(loggable: Loggable): void;
    /**
     * Log a message with the info level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    info(message: string, ...params: any[]): void;

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
    warn(loggable: Loggable): void;
    /**
     * Log a message with the warn level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    warn(message: string, ...params: any[]): void;

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
    error(loggable: Loggable): void;
    /**
     * Log a message with the error level.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    error(message: string, ...params: any[]): void;

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
    fatal(loggable: Loggable): void;
    /**
     * Log a message with the fatal level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    fatal(message: string, ...params: any[]): void;

    /**
     * Create a child logger from this logger.
     *
     * @param obj - The options object to create the logger with.
     */
    child(obj: Object): ILogger;
}

@injectable()
export class Logger implements ILogger {

    /* Log level for the logger.  */
    protected _logLevel: Promise<number>;

    /* Root logger has id 1.  */
    protected readonly rootLoggerId = 1;

    /* Default id is the root logger id.  */
    protected id: Promise<number> = Promise.resolve(this.rootLoggerId);

    /**
     * Build a new Logger.
     *
     * @param options - The options to build the logger with, see the
     * bunyan child method documentation for more information.
     */
    constructor(
        @inject(ILoggerServer) protected readonly server: ILoggerServer,
        @inject(LoggerWatcher) protected readonly loggerWatcher: LoggerWatcher,
        @inject(LoggerFactory) protected readonly factory: LoggerFactory,
        @inject(LoggerOptions) @optional() options: object | undefined) {

        /* Creating a child logger.  */
        if (options !== undefined) {
            this.id = server.child(options);
        }

        /* Fetch the log level so it's cached in the frontend.  */
        this._logLevel = this.id.then(id => this.server.getLogLevel(id));

        /* Update the root logger log level if it changes in the backend. */
        loggerWatcher.onLogLevelChanged(event => {
            this.id.then(id => {
                if (id === this.rootLoggerId) {
                    this._logLevel = Promise.resolve(event.newLogLevel);
                }
            });
        });
    }

    setLogLevel(logLevel: number): Promise<void> {
        return new Promise<void>((resolve) => {
            this.id.then(id => {
                this._logLevel.then(oldLevel => {
                    this.server.setLogLevel(id, logLevel).then(() => {
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
    log(logLevel: number, arg2: string | Loggable, ...params: any[]): void {
        this.getLog(logLevel).then(log => {
            if (typeof arg2 === 'string') {
                const message = arg2;
                log(message, params);
            } else {
                const loggable = arg2;
                loggable(log);
            }
        });
    }
    protected getLog(logLevel: number): Promise<Log> {
        return this.ifEnabled(logLevel).then(() =>
            this.id.then(id =>
                (message: string, params: any[]) =>
                    this.server.log(id, logLevel, message, params)
            )
        );
    }

    isTrace(): Promise<boolean> {
        return this.isEnabled(LogLevel.TRACE);
    }
    ifTrace(): Promise<void> {
        return this.ifEnabled(LogLevel.TRACE);
    }
    trace(arg: string | Loggable, ...params: any[]): void {
        this.log(LogLevel.TRACE, arg, params);
    }

    isDebug(): Promise<boolean> {
        return this.isEnabled(LogLevel.DEBUG);
    }
    ifDebug(): Promise<void> {
        return this.ifEnabled(LogLevel.DEBUG);
    }
    debug(arg: string | Loggable, ...params: any[]): void {
        this.log(LogLevel.DEBUG, arg, params);
    }

    isInfo(): Promise<boolean> {
        return this.isEnabled(LogLevel.INFO);
    }
    ifInfo(): Promise<void> {
        return this.ifEnabled(LogLevel.INFO);
    }
    info(arg: string | Loggable, ...params: any[]): void {
        this.log(LogLevel.INFO, arg, params);
    }

    isWarn(): Promise<boolean> {
        return this.isEnabled(LogLevel.WARN);
    }
    ifWarn(): Promise<void> {
        return this.ifEnabled(LogLevel.WARN);
    }
    warn(arg: string | Loggable, ...params: any[]): void {
        this.log(LogLevel.WARN, arg, params);
    }

    isError(): Promise<boolean> {
        return this.isEnabled(LogLevel.ERROR);
    }
    ifError(): Promise<void> {
        return this.ifEnabled(LogLevel.ERROR);
    }
    error(arg: string | Loggable, ...params: any[]): void {
        this.log(LogLevel.ERROR, arg, params);
    }

    isFatal(): Promise<boolean> {
        return this.isEnabled(LogLevel.FATAL);
    }
    ifFatal(): Promise<void> {
        return this.ifEnabled(LogLevel.FATAL);
    }
    fatal(arg: string | Loggable, ...params: any[]): void {
        this.log(LogLevel.FATAL, arg, params);
    }

    child(obj: object): ILogger {
        return this.factory(obj);
    }
}
