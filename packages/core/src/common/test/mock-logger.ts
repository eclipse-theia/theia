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

// tslint:disable:no-any

import { injectable } from 'inversify';
import { ILogger, Loggable } from '../logger';

@injectable()
export class MockLogger implements ILogger {

    setLogLevel(logLevel: number): Promise<void> {
        return Promise.resolve();
    }

    getLogLevel(): Promise<number> {
        return Promise.resolve(0);
    }

    isEnabled(logLevel: number): Promise<boolean> {
        return Promise.resolve(true);
    }

    ifEnabled(logLevel: number): Promise<void> {
        return Promise.resolve();
    }

    log(logLevel: number, arg2: string | Loggable | Error, ...params: any[]): Promise<void> {
        return Promise.resolve();
    }

    isTrace(): Promise<boolean> {
        return Promise.resolve(true);
    }

    ifTrace(): Promise<void> {
        return Promise.resolve();
    }
    trace(arg: string | Loggable, ...params: any[]): Promise<void> {
        return Promise.resolve();
    }

    isDebug(): Promise<boolean> {
        return Promise.resolve(true);
    }

    ifDebug(): Promise<void> {
        return Promise.resolve();
    }

    debug(arg: string | Loggable, ...params: any[]): Promise<void> {
        return Promise.resolve();
    }

    isInfo(): Promise<boolean> {
        return Promise.resolve(true);
    }

    ifInfo(): Promise<void> {
        return Promise.resolve();
    }

    info(arg: string | Loggable, ...params: any[]): Promise<void> {
        return Promise.resolve();
    }

    isWarn(): Promise<boolean> {
        return Promise.resolve(true);
    }

    ifWarn(): Promise<void> {
        return Promise.resolve();
    }

    warn(arg: string | Loggable, ...params: any[]): Promise<void> {
        return Promise.resolve();
    }

    isError(): Promise<boolean> {
        return Promise.resolve(true);
    }

    ifError(): Promise<void> {
        return Promise.resolve();
    }
    error(arg: string | Loggable | Error, ...params: any[]): Promise<void> {
        return Promise.resolve();
    }

    isFatal(): Promise<boolean> {
        return Promise.resolve(true);
    }

    ifFatal(): Promise<void> {
        return Promise.resolve();
    }

    fatal(arg: string | Loggable, ...params: any[]): Promise<void> {
        return Promise.resolve();
    }

    child(obj: Object): ILogger {
        return this;
    }
}
