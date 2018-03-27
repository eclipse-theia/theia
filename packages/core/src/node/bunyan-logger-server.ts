/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as bunyan from 'bunyan';
import * as yargs from 'yargs';
import { inject, injectable } from 'inversify';
import { LogLevel } from '../common/logger';
import { ILoggerServer, ILoggerClient, LoggerServerOptions } from '../common/logger-protocol';
import { CliContribution } from './cli';

@injectable()
export class LogLevelCliContribution implements CliContribution {

    logLevel: string;

    configure(conf: yargs.Argv): void {
        conf.option('log-level', {
            description: 'Sets the log level',
            default: 'info',
            choices: ['trace', 'debug', 'info', 'warn', 'error', 'fatal']
        });
    }

    setArguments(args: yargs.Arguments): void {
        this.logLevel = args['log-level'];
    }
}

@injectable()
export class BunyanLoggerServer implements ILoggerServer {

    /* Root logger and all child logger array.  */
    private loggers = new Map<number, bunyan>();

    /* ID counter for the children.  */
    private currentId = 0;

    /* Logger client to send notifications to.  */
    private client: ILoggerClient | undefined = undefined;

    /* Default log level.  */
    private logLevel: number = LogLevel.INFO;

    /* Root logger id.  */
    private readonly rootLoggerId = 0;

    constructor( @inject(LoggerServerOptions) options: object) {
        this.loggers.set(this.currentId++, bunyan.createLogger(
            <bunyan.LoggerOptions>options
        ));
    }

    dispose(): void {
        // no-op
    }

    /* See the bunyan child documentation, this creates a child logger
     * with the added properties of object in param.  */
    child(obj: Object): Promise<number> {
        const rootLogger = this.loggers.get(this.rootLoggerId);
        if (rootLogger !== undefined) {
            const id = this.currentId;
            this.loggers.set(id, rootLogger.child(obj));
            this.currentId++;
            return Promise.resolve(id);
        } else {
            throw new Error('No root logger');
        }
    }

    /* Set the client to receive notifications on.  */
    setClient(client: ILoggerClient | undefined) {
        this.client = client;
    }

    /* Set the log level for a logger.  */
    setLogLevel(id: number, logLevel: number): Promise<void> {
        const oldLogLevel = this.logLevel;
        const logger = this.loggers.get(id);
        if (logger === undefined) {
            throw new Error(`No logger for id: ${id}`);
        }

        logger.level(this.toBunyanLevel(logLevel));
        this.logLevel = logLevel;

        /* Only notify about the root logger level changes.  */
        if (this.client !== undefined && id === this.rootLoggerId) {
            this.client.onLogLevelChanged({ oldLogLevel: oldLogLevel, newLogLevel: this.logLevel });
        }
        return Promise.resolve();
    }

    /* Get the log level for a logger.  */
    getLogLevel(id: number): Promise<number> {
        const logger = this.loggers.get(id);
        if (logger === undefined) {
            throw new Error(`No logger for id: ${id}`);
        }

        return Promise.resolve(
            this.toLogLevel(logger.level())
        );
    }

    /* Log a message to a logger.  */
    log(id: number, logLevel: number, message: string, params: any[]): Promise<void> {
        const logger = this.loggers.get(id);
        if (logger === undefined) {
            throw new Error(`No logger for id: ${id}`);
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

    protected toLogLevel(bunyanLogLevel: number | string): number {
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
