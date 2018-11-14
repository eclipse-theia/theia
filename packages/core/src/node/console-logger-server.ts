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
import { LoggerWatcher } from '../common/logger-watcher';
import { LogLevelCliContribution } from './logger-cli-contribution';
import { ILoggerServer, ILoggerClient, ConsoleLogger } from '../common/logger-protocol';

@injectable()
export class ConsoleLoggerServer implements ILoggerServer {

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
    }

    async setLogLevel(name: string, newLogLevel: number): Promise<void> {
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
        return this.cli.logLevelFor(name);
    }

    // tslint:disable:no-any
    async log(name: string, logLevel: number, message: string, params: any[]): Promise<void> {
        const configuredLogLevel = await this.getLogLevel(name);
        if (logLevel >= configuredLogLevel) {
            ConsoleLogger.log(name, logLevel, message, params);
        }
    }

    async child(name: string): Promise<void> {
        this.setLogLevel(name, this.cli.logLevelFor(name));
    }

    dispose(): void { }

    setClient(client: ILoggerClient | undefined) {
        this.client = client;
    }

}
