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

export const LoggerFactory = Symbol('LoggerFactory')
export type LoggerFactory = (options?: object) => ILogger;

export const LoggerOptions = Symbol('LoggerOptions')

export const ILogger = Symbol('ILogger');

export interface ILogger {
    child(obj: Object): ILogger;
    setLogLevel(logLevel: number): Promise<void>
    getLogLevel(): Promise<number>;
    trace(message: string, ...params: any[]): void;
    debug(message: string, ...params: any[]): void;
    info(message: string, ...params: any[]): void;
    warn(message: string, ...params: any[]): void;
    error(message: string, ...params: any[]): void;
    fatal(message: string, ...params: any[]): void;
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

    /**
     * Set the log level.
     *
     * @param loglevel - The loglevel to set. see Logger.LogLevel for
     * possible options.
     */
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

    /**
     * Get the log level.
     *
     * @returns a Promise to the log level.
     */
    getLogLevel(): Promise<number> {
        return this._logLevel;
    }

    /**
     * Create a child logger from this logger.
     *
     * @params obj - The options object to create the logger with. See
     * bunyan documentation for more information.
     */
    child(obj: object): ILogger {
        return this.factory(obj);
    }

    /**
     * Log a message with the trace level.
     *
     * @params message - The message format string.
     * @params params - The format string variables.
     */
    trace(message: string, ...params: any[]): void {
        this.log(LogLevel.TRACE, message, params);
    }

    /**
     * Log a message with the debug level.
     *
     * @params message - The message format string.
     * @params params - The format string variables.
     */
    debug(message: string, ...params: any[]): void {
        this.log(LogLevel.DEBUG, message, params);
    }

    /**
     * Log a message with the info level.
     *
     * @params message - The message format string.
     * @params params - The format string variables.
     */
    info(message: string, ...params: any[]): void {
        this.log(LogLevel.INFO, message, params);
    }

    /**
     * Log a message with the warn level.
     *
     * @params message - The message format string.
     * @params params - The format string variables.
     */
    warn(message: string, ...params: any[]): void {
        this.log(LogLevel.WARN, message, params);
    }

    /**
     * Log a message with the error level.
     *
     * @params message - The message format string.
     * @params params - The format string variables.
     */
    error(message: string, ...params: any[]): void {
        this.log(LogLevel.ERROR, message, params);
    }

    /**
     * Log a message with the fatal level.     *
     * @params message - The message format string.
     * @params params - The format string variables.
     */
    fatal(message: string, ...params: any[]): void {
        this.log(LogLevel.FATAL, message, params);
    }

    /**
     * Log a message with the a variable level.
     *
     * @params logLEvel - The loglevel to use.
     * @params message - The message format string.
     * @params params - The format string variables.
     */
    protected log(logLevel: number, message: string, ...params: any[]): void {
        this.id.then(id => {
            this._logLevel.then(level => {
                if (logLevel >= level) {
                    this.server.log(id, logLevel, message, params)
                }
            })
        });
    }
}
