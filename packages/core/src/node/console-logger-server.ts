// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from 'inversify';
import { LoggerWatcher } from '../common/logger-watcher';
import { LogLevelCliContribution } from './logger-cli-contribution';
import { ILoggerServer, ILoggerClient, ConsoleLogger, rootLoggerName } from '../common/logger-protocol';
import { format } from 'util';
import { EOL } from 'os';
import * as fs from 'fs';

@injectable()
export class ConsoleLoggerServer implements ILoggerServer {

    protected client?: ILoggerClient;

    @inject(LoggerWatcher)
    protected watcher: LoggerWatcher;

    @inject(LogLevelCliContribution)
    protected cli: LogLevelCliContribution;

    protected logFileStream?: fs.WriteStream;

    @postConstruct()
    protected init(): void {
        this.setLogLevel(rootLoggerName, this.cli.defaultLogLevel);
        for (const name of Object.keys(this.cli.logLevels)) {
            this.setLogLevel(name, this.cli.logLevels[name]);
        }
        this.cli.onLogConfigChanged(() => {
            this.client?.onLogConfigChanged();
        });
    }

    async setLogLevel(name: string, newLogLevel: number): Promise<void> {
        const event = {
            loggerName: name,
            newLogLevel
        };
        if (this.client !== undefined) {
            this.client.onLogLevelChanged(event);
        }
    }

    async getLogLevel(name: string): Promise<number> {
        return this.cli.logLevelFor(name);
    }

    /* eslint-disable @typescript-eslint/no-explicit-any */
    async log(name: string, logLevel: number, message: string, params: any[]): Promise<void> {
        const configuredLogLevel = await this.getLogLevel(name);
        if (logLevel >= configuredLogLevel) {
            const fullMessage = ConsoleLogger.log(name, logLevel, message, params);
            this.logToFile(fullMessage, params);
        }
    }

    protected logToFile(message: string, params: any[]): void {
        if (this.cli.logFile && !this.logFileStream) {
            this.logFileStream = fs.createWriteStream(this.cli.logFile, { flags: 'a' });
            // Only log errors once to avoid spamming the console
            this.logFileStream.once('error', error => {
                console.error(`Error writing to log file ${this.cli.logFile}`, error);
            });
        }
        if (this.logFileStream) {
            const formatted = format(message, ...params) + EOL;
            this.logFileStream.write(formatted);
        }
    }

    async child(name: string): Promise<void> {
        this.setLogLevel(name, this.cli.logLevelFor(name));
    }

    dispose(): void { }

    setClient(client: ILoggerClient | undefined): void {
        this.client = client;
    }

}
