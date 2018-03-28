/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable } from 'inversify';
import { LoggerWatcher } from './logger-watcher';
import { ILoggerServer } from './logger-protocol';

// tslint:disable:no-any

export enum LogLevel {
    FATAL = 60,
    ERROR = 50,
    WARN = 40,
    INFO = 30,
    DEBUG = 20,
    TRACE = 10
}

export namespace LogLevel {
    export const strings = new Map<LogLevel, string>([
        [LogLevel.FATAL, 'fatal'],
        [LogLevel.ERROR, 'error'],
        [LogLevel.WARN, 'warn'],
        [LogLevel.INFO, 'info'],
        [LogLevel.DEBUG, 'debug'],
        [LogLevel.TRACE, 'trace'],

    ]);

    export function toString(level: LogLevel): string | undefined {
        return strings.get(level);
    }

    export function fromString(levelStr: string): LogLevel | undefined {
        for (const pair of strings) {
            if (pair[1] === levelStr) {
                return pair[0];
            }
        }

        return undefined;
    }
}

type ConsoleLog = typeof console.log;
type ConsoleInfo = typeof console.info;
type ConsoleWarn = typeof console.warn;
type ConsoleError = typeof console.error;

let originalConsoleLog: ConsoleLog;
let originalConsoleInfo: ConsoleInfo;
let originalConsoleWarn: ConsoleWarn;
let originalConsoleError: ConsoleError;

/* This is to be initialized from container composition root. It can be used outside of the inversify context.  */
export let logger: ILogger;

export const rootLoggerName: string = 'root';

/**
 * Counterpart of the `#setRootLogger(ILogger)`. Restores the `console.xxx` bindings to the original one.
 * Invoking has no side-effect if `setRootLogger` was not called before. Multiple function invocation has
 * no side-effect either.
 */
export function unsetRootLogger() {
    if (logger !== undefined) {
        console.log = originalConsoleLog;
        console.info = originalConsoleInfo;
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;
        (<any>logger) = undefined;
    }
}

export function setRootLogger(aLogger: ILogger) {
    if (logger === undefined) {
        originalConsoleLog = console.log;
        originalConsoleInfo = console.info;
        originalConsoleWarn = console.warn;
        originalConsoleError = console.error;
    }
    logger = aLogger;
    const frontend = typeof window !== 'undefined' && typeof (window as any).process === 'undefined';
    const log = (logLevel: number, consoleLog: ConsoleLog, message?: any, ...optionalParams: any[]) => {
        aLogger.log(logLevel, String(message), ...optionalParams);
        if (frontend) {
            consoleLog(message, ...optionalParams);
        }
    };

    console.log = log.bind(undefined, LogLevel.INFO, console.log);
    console.info = log.bind(undefined, LogLevel.INFO, console.info);
    console.warn = log.bind(undefined, LogLevel.WARN, console.warn);
    console.error = log.bind(undefined, LogLevel.ERROR, console.error);
}

export type Log = (message: string, ...params: any[]) => void;
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
     * Log an error with the given level if it is enabled.
     */
    log(logLevel: number, error: Error): Promise<void>;
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
    trace(loggable: Loggable): Promise<void>;
    /**
     * Log a message with the trace level if it is enabled.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    trace(message: string, ...params: any[]): Promise<void>;

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
    debug(message: string, ...params: any[]): Promise<void>;

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
    info(message: string, ...params: any[]): Promise<void>;

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
    warn(message: string, ...params: any[]): Promise<void>;

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
     * Log an error, e.g. when received in a `catch` block.
     */
    error(error: Error): Promise<void>;
    /**
     * Log a message with the error level.
     *
     * @param message - The message format string.
     * @param params - The format string variables.
     */
    error(message: string, ...params: any[]): Promise<void>;

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
    fatal(message: string, ...params: any[]): Promise<void>;

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
     *
     * @param options - The options to build the logger with, see the
     * bunyan child method documentation for more information.
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
    log(logLevel: number, arg2: string | Loggable | Error, ...params: any[]): Promise<void> {
        return this.getLog(logLevel).then(log => {
            if (typeof arg2 === 'string') {
                const message = arg2;
                log(message, ...params);
            } else if (typeof arg2 === 'function') {
                const loggable = arg2;
                loggable(log);
            } else if (arg2) {
                const message = arg2.toString();
                if (params.length === 0 && arg2.stack) {
                    log(message, [arg2.stack]);
                } else {
                    log(message, ...params);
                }
            }
        });
    }
    protected getLog(logLevel: number): Promise<Log> {
        return this.ifEnabled(logLevel).then(() =>
            this.created.then(() =>
                (message: string, ...params: any[]) =>
                    this.server.log(this.name, logLevel, message, params)
            )
        );
    }

    isTrace(): Promise<boolean> {
        return this.isEnabled(LogLevel.TRACE);
    }
    ifTrace(): Promise<void> {
        return this.ifEnabled(LogLevel.TRACE);
    }
    trace(arg: string | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.TRACE, arg, ...params);
    }

    isDebug(): Promise<boolean> {
        return this.isEnabled(LogLevel.DEBUG);
    }
    ifDebug(): Promise<void> {
        return this.ifEnabled(LogLevel.DEBUG);
    }
    debug(arg: string | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.DEBUG, arg, ...params);
    }

    isInfo(): Promise<boolean> {
        return this.isEnabled(LogLevel.INFO);
    }
    ifInfo(): Promise<void> {
        return this.ifEnabled(LogLevel.INFO);
    }
    info(arg: string | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.INFO, arg, ...params);
    }

    isWarn(): Promise<boolean> {
        return this.isEnabled(LogLevel.WARN);
    }
    ifWarn(): Promise<void> {
        return this.ifEnabled(LogLevel.WARN);
    }
    warn(arg: string | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.WARN, arg, ...params);
    }

    isError(): Promise<boolean> {
        return this.isEnabled(LogLevel.ERROR);
    }
    ifError(): Promise<void> {
        return this.ifEnabled(LogLevel.ERROR);
    }
    error(arg: string | Loggable | Error, ...params: any[]): Promise<void> {
        return this.log(LogLevel.ERROR, arg, ...params);
    }

    isFatal(): Promise<boolean> {
        return this.isEnabled(LogLevel.FATAL);
    }
    ifFatal(): Promise<void> {
        return this.ifEnabled(LogLevel.FATAL);
    }
    fatal(arg: string | Loggable, ...params: any[]): Promise<void> {
        return this.log(LogLevel.FATAL, arg, ...params);
    }

    child(name: string): ILogger {
        return this.factory(name);
    }
}
