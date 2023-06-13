// *****************************************************************************
// Copyright (C) 2023 STMicroelectronics and others.
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

import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import * as theia from '@theia/plugin';

import { OutputChannelRegistryMain, PluginInfo } from '../../common/plugin-api-rpc';
import { OutputChannelImpl } from './output-channel-item';
import { LogLevel } from '../types-impl';
import { isArray, isObject } from '@theia/core';

export class LogOutputChannelImpl extends OutputChannelImpl implements theia.LogOutputChannel {

    readonly onDidChangeLogLevelEmitter: Emitter<theia.LogLevel> = new Emitter<theia.LogLevel>();
    readonly onDidChangeLogLevel: theia.Event<theia.LogLevel> = this.onDidChangeLogLevelEmitter.event;
    public logLevel: theia.LogLevel;

    constructor(name: string, proxy: OutputChannelRegistryMain, pluginInfo: PluginInfo) {
        super(name, proxy, pluginInfo);
        this.setLogLevel(LogLevel.Info);
    }

    setLogLevel(level: theia.LogLevel): void {
        if (this.logLevel !== level) {
            this.logLevel = level;
            this.onDidChangeLogLevelEmitter.fire(this.logLevel);
        }
    }

    getLogLevel(): theia.LogLevel {
        return this.logLevel;
    }

    override append(value: string): void {
        super.validate();
        this.info(value);
    }

    override appendLine(value: string): void {
        super.validate();
        this.append(value + '\n');
    }

    override dispose(): void {
        super.dispose();
        this.onDidChangeLogLevelEmitter.dispose();
    }

    protected log(level: theia.LogLevel, message: string): void {
        super.validate();
        if (this.checkLogLevel(level)) {
            const now = new Date();
            const eol = message.endsWith('\n') ? '' : '\n';
            const logMessage = `${now.toISOString()} [${LogLevel[level]}] ${message}${eol}`;
            this.proxy.$append(this.name, logMessage, this.pluginInfo);
        }
    }

    private checkLogLevel(level: theia.LogLevel): boolean {
        return this.logLevel <= level;
    }

    trace(message: string, ...args: any[]): void {
        this.log(LogLevel.Trace, this.format(message, args));
    }

    debug(message: string, ...args: any[]): void {
        this.log(LogLevel.Debug, this.format(message, args));
    }

    info(message: string, ...args: any[]): void {
        this.log(LogLevel.Info, this.format(message, args));
    }

    warn(message: string, ...args: any[]): void {
        this.log(LogLevel.Warning, this.format(message, args));
    }

    error(errorMsg: string | Error, ...args: any[]): void {
        if (errorMsg instanceof Error) {
            this.log(LogLevel.Error, this.format(errorMsg.stack || errorMsg.message, args));
        } else {
            this.log(LogLevel.Error, this.format(errorMsg, args));
        }
    }

    private format(message: string, args: any[]): string {
        if (args.length > 0) {
            return `${message} ${args.map((arg: any) => isObject(arg) || isArray(arg) ? JSON.stringify(arg) : arg).join(' ')}`;
        }
        return message;
    }

}
