/*
 * Copyright (C) 2017 Ericsson and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import * as bunyan from 'bunyan';
import * as yargs from 'yargs';
import { injectable } from 'inversify';
import { LogLevel } from '../../application/common/logger';
import { ILoggerServer, ILoggerClient } from '../../application/common/logger-protocol';

yargs.usage(`Usage main.js [--loglevel='trace','debug','info','warn','error','fatal']`)
    .default('loglevel', 'info')
    .describe('loglevel', 'Sets the log level')
    .help()
    .argv;

@injectable()
export class BunyanLoggerServer implements ILoggerServer {

    /* Root logger and all child logger array.  */
    private loggers: bunyan[] = [];

    /* Logger client to send notifications to.  */
    private client: ILoggerClient | undefined = undefined;

    /* Default log level.  */
    private logLevel: number = LogLevel.INFO;

    /* Root logger id, this is a workaround to a bug with 0 in jsonrpc.  */
    private readonly rootLoggerId = 1;

    constructor() {
        /* This is a workaround to a bug in json-rpc sending 0 is actually
         * sending null rather than the number 0. In effect this starts
         * the loggers indexes at 1. */
        this.loggers.push({} as any);

        let logLevel = yargs.argv.loglevel;
        if (['trace', 'debug', 'info', 'warn', 'error', 'fatal'].indexOf(logLevel) < 0) {
            logLevel = 'info';
        }

        this.loggers.push(bunyan.createLogger({
            name: 'Theia',
            level: logLevel
        }));
    }

    /* See the bunyan child documentation, this creates a child logger
     * with the added properties of object in param.  */
    child(obj: Object): Promise<number> {
        this.loggers.push(this.loggers[this.rootLoggerId].child(obj));
        return Promise.resolve(this.loggers.length - 1);
    }

    /* Set the client to receive notifications on.  */
    setClient(client: ILoggerClient | undefined) {
        this.client = client;
    }

    /* Set the log level for a logger.  */
    setLogLevel(id: number, logLevel: number): Promise<void> {
        const oldLogLevel = this.logLevel;

        this.loggers[id].level(this.toBunyanLevel(logLevel));
        this.logLevel = logLevel;

        /* Only notify about the root logger level changes.  */
        if (this.client !== undefined && id === this.rootLoggerId) {
            this.client.onLogLevelChanged({ oldLogLevel: oldLogLevel, newLogLevel: this.logLevel });
        }
        return Promise.resolve();
    }

    /* Get the log level for a logger.  */
    getLogLevel(id: number): Promise<number> {
        return Promise.resolve(
            this.toLogLevel(this.loggers[id].level())
        );
    }

    /* Log a message to a logger.  */
    log(id: number, logLevel: number, message: string, params: any[]): Promise<void> {
        switch (logLevel) {
            case LogLevel.TRACE:
                this.loggers[id].trace(message, params);
                break;
            case LogLevel.DEBUG:
                this.loggers[id].debug(message, params);
                break;
            case LogLevel.INFO:
                this.loggers[id].info(message, params);
                break;
            case LogLevel.WARN:
                this.loggers[id].warn(message, params);
                break;
            case LogLevel.ERROR:
                this.loggers[id].error(message, params);
                break;
            case LogLevel.FATAL:
                this.loggers[id].fatal(message, params);
                break;
            default:
                this.loggers[id].info(message, params);
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