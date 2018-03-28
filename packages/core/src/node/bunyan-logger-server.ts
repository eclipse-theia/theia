/*
 * Copyright (C) 2018 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as bunyan from 'bunyan';
import { inject, injectable, postConstruct } from 'inversify';
import { LogLevel, rootLoggerName } from '../common/logger';
import { ILoggerServer, ILoggerClient, ILogLevelChangedEvent } from '../common/logger-protocol';
import { LoggerWatcher } from '../common/logger-watcher';
import { LogLevelCliContribution } from './logger-cli-contribution';

@injectable()
export class BunyanLoggerServer implements ILoggerServer {

    /* Root logger and all child logger array.  */
    private loggers = new Map<string, bunyan>();

    /* Logger client to send notifications to.  */
    private client: ILoggerClient | undefined = undefined;

    @inject(LoggerWatcher)
    protected watcher: LoggerWatcher;

    @inject(LogLevelCliContribution)
    protected cli: LogLevelCliContribution;

    @postConstruct()
    protected init() {
        /* Create the root logger by default.  */
        const opts = this.makeLoggerOptions(rootLoggerName);
        const rootOpts = Object.assign(opts, { name: 'Theia' });
        const logger = bunyan.createLogger(rootOpts);
        this.loggers.set(rootLoggerName, logger);

        this.cli.onLogConfigChanged(() => this.updateLogLevels());
    }

    protected updateLogLevels() {
        for (const [loggerName, _] of this.loggers) {
            const newLevel = this.cli.logLevelFor(loggerName);
            this.setLogLevel(loggerName, newLevel);
        }
    }

    protected makeLoggerOptions(name: string) {
        const opts = {
            logger: name,
            level: this.toBunyanLevel(this.cli.logLevelFor(name)),
        };

        return opts;
    }

    dispose(): void {
        // no-op
    }

    /* Create a logger child of the root logger.  See the bunyan child
     * documentation.  */
    child(name: string): Promise<void> {
        if (name.length === 0) {
            return Promise.reject("Can't create a logger with an empty name.");
        }

        if (this.loggers.has(name)) {
            /* Logger already exists.  */
            return Promise.resolve();
        }

        const rootLogger = this.loggers.get(rootLoggerName);
        if (rootLogger === undefined) {
            throw new Error('No root logger.');
        }

        const opts = this.makeLoggerOptions(name);
        const logger = rootLogger.child(opts);
        this.loggers.set(name, logger);

        return Promise.resolve();
    }

    /* Set the client to receive notifications on.  */
    setClient(client: ILoggerClient | undefined) {
        this.client = client;
    }

    /**
     * Set the log level for a logger.  logLevel should be one of Theia's
     * LogLevel.
     */
    setLogLevel(name: string, newLogLevel: number): Promise<void> {
        const logger = this.loggers.get(name);
        if (logger === undefined) {
            throw new Error(`No logger named ${name}.`);
        }

        // Does the log level really change?
        const newBunyanLogLevel = this.toBunyanLevel(newLogLevel);
        if (newBunyanLogLevel === logger.level()) {
            return Promise.resolve();
        }

        logger.level(newBunyanLogLevel);

        const changedEvent: ILogLevelChangedEvent = {
            loggerName: name,
            newLogLevel: newLogLevel,
        };

        /* Notify the frontend.  */
        if (this.client !== undefined) {
            this.client.onLogLevelChanged(changedEvent);
        }

        /* Notify the backend.  */
        this.watcher.fireLogLevelChanged(changedEvent);

        return Promise.resolve();
    }

    /* Get the log level for a logger.  */
    getLogLevel(name: string): Promise<number> {
        const logger = this.loggers.get(name);
        if (logger === undefined) {
            throw new Error(`No logger named ${name}.`);
        }

        return Promise.resolve(
            this.toTheiaLevel(logger.level())
        );
    }

    /* Log a message to a logger.  */
    log(name: string, logLevel: number, message: string, params: any[]): Promise<void> {
        const logger = this.loggers.get(name);
        if (logger === undefined) {
            throw new Error(`No logger named ${name}.`);
        }

        switch (logLevel) {
            case LogLevel.TRACE:
                logger.trace(message, params);
                break;
            case LogLevel.DEBUG:
                logger.debug(message, params);
                break;
            case LogLevel.INFO:
                logger.info(message, params);
                break;
            case LogLevel.WARN:
                logger.warn(message, params);
                break;
            case LogLevel.ERROR:
                logger.error(message, params);
                break;
            case LogLevel.FATAL:
                logger.fatal(message, params);
                break;
            default:
                logger.info(message, params);
                break;
        }
        return Promise.resolve();
    }

    /* Convert Theia's log levels to bunyan's.  */
    protected toBunyanLevel(logLevel: number): number {
        switch (logLevel) {
            case LogLevel.FATAL:
                return bunyan.FATAL;
            case LogLevel.ERROR:
                return bunyan.ERROR;
            case LogLevel.WARN:
                return bunyan.WARN;
            case LogLevel.INFO:
                return bunyan.INFO;
            case LogLevel.DEBUG:
                return bunyan.DEBUG;
            case LogLevel.TRACE:
                return bunyan.TRACE;
            default:
                return bunyan.INFO;
        }
    }

    /**
     * Convert Bunyan's log levels to Theia's.
     */
    protected toTheiaLevel(bunyanLogLevel: number | string): number {
        switch (Number(bunyanLogLevel)) {
            case bunyan.FATAL:
                return LogLevel.FATAL;
            case bunyan.ERROR:
                return LogLevel.ERROR;
            case bunyan.WARN:
                return LogLevel.WARN;
            case bunyan.INFO:
                return LogLevel.INFO;
            case bunyan.DEBUG:
                return LogLevel.DEBUG;
            case bunyan.TRACE:
                return LogLevel.TRACE;
            default:
                return LogLevel.INFO;
        }
    }

}
