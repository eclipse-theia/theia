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

import { inject, injectable, postConstruct } from 'inversify';
import { LogLevel } from '../common/logger';
import { LoggerWatcher } from '../common/logger-watcher';
import { LogLevelCliContribution } from './logger-cli-contribution';
import { ILoggerServer, ILoggerClient } from '../common/logger-protocol';

// tslint:disable-next-line:no-any
type Console = (message?: any, ...optionalParams: any[]) => void;
const originalConsoleLog = console.log;
const Consoles = new Map<LogLevel, Console>([
    [LogLevel.FATAL, console.error],
    [LogLevel.ERROR, console.error],
    [LogLevel.WARN, console.warn],
    [LogLevel.INFO, console.info],
    [LogLevel.DEBUG, console.debug],
    [LogLevel.TRACE, console.trace]
]);

@injectable()
export class ConsoleLoggerServer implements ILoggerServer {

    protected readonly loggers = new Map<string, number>();
    protected client: ILoggerClient | undefined = undefined;

    @inject(LoggerWatcher)
    protected watcher: LoggerWatcher;

    @inject(LogLevelCliContribution)
    protected cli: LogLevelCliContribution;

    @postConstruct()
    protected init() {
        for (const name of Object.keys(this.cli.logLevels)) {
            this.setLogLevel(name, this.cli.logLevels[name]);
        }
        this.cli.onLogConfigChanged(() => this.updateLogLevels());
    }

    async setLogLevel(name: string, newLogLevel: number): Promise<void> {
        this.loggers.set(name, newLogLevel);
        const event = {
            loggerName: name,
            newLogLevel
        };
        if (this.client !== undefined) {
            this.client.onLogLevelChanged(event);
        }
        this.watcher.fireLogLevelChanged(event);
    }

    async getLogLevel(name: string): Promise<number> {
        return this.loggers.get(name) || this.cli.defaultLogLevel;
    }

    // tslint:disable-next-line:no-any
    async log(name: string, logLevel: number, message: string, params: any[]): Promise<void> {
        const configuredLogLevel = await this.getLogLevel(name);
        if (logLevel >= configuredLogLevel) {
            const console = Consoles.get(logLevel) || originalConsoleLog;
            const severity = `${(LogLevel.strings.get(logLevel) || 'unknown').toUpperCase()}`;
            console(`${name} ${severity}`, message, ...params);
        }
    }

    async child(name: string): Promise<void> {
        this.setLogLevel(name, LogLevel.INFO);
    }

    dispose(): void {
        this.loggers.clear();
    }

    setClient(client: ILoggerClient | undefined) {
        this.client = client;
    }

    protected updateLogLevels() {
        for (const loggerName of this.loggers.keys()) {
            const newLevel = this.cli.logLevelFor(loggerName);
            this.setLogLevel(loggerName, newLevel);
        }
    }

}
