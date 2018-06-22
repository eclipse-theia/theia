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

import { injectable } from "inversify";
import { LogLevel } from './logger';
import { ILoggerServer, ILoggerClient } from './logger-protocol';

@injectable()
export class ConsoleLoggerServer implements ILoggerServer {
    setLogLevel(name: string, logLevel: number): Promise<void> {
        return Promise.resolve();
    }
    getLogLevel(name: string): Promise<number> {
        return Promise.resolve(LogLevel.DEBUG);
    }
    log(name: string, logLevel: number, message: string, params: any[]): Promise<void> {
        console.log(`${message} ${params.map(p => p.toString()).join(' ')}`);
        return Promise.resolve();
    }
    child(name: string): Promise<void> {
        return Promise.resolve();
    }
    dispose(): void {
    }
    setClient(client: ILoggerClient | undefined): void {
    }
}
