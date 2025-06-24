// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { LoggerMain, LogLevel, PLUGIN_RPC_CONTEXT } from '../common';
import { RPCProtocol } from '../common/rpc-protocol';

export class PluginLogger {

    private readonly logger: LoggerMain;
    private readonly name?: string;

    constructor(rpc: RPCProtocol, name?: string) {
        this.name = name;
        this.logger = rpc.getProxy(PLUGIN_RPC_CONTEXT.LOGGER_MAIN);
    }

    trace(message: string, ...params: any[]): void {
        this.sendLog(LogLevel.Trace, message, params);
    }

    debug(message: string, ...params: any[]): void {
        this.sendLog(LogLevel.Debug, message, params);
    }

    log(logLevel: LogLevel, message: string, ...params: any[]): void {
        this.sendLog(logLevel, message, params);
    }

    info(message: string, ...params: any[]): void {
        this.sendLog(LogLevel.Info, message, params);
    }

    warn(message: string, ...params: any[]): void {
        this.sendLog(LogLevel.Warn, message, params);
    }

    error(message: string, ...params: any[]): void {
        this.sendLog(LogLevel.Error, message, params);
    }

    private sendLog(level: LogLevel, message: string, params: any[]): void {
        this.logger.$log(level, this.name, this.toLog(message), params.map(e => this.toLog(e)));
    }

    private toLog(value: any): any {
        if (value instanceof Error) {
            return value.stack ?? value.message ?? value.toString();
        }
        return value;
    }
}
