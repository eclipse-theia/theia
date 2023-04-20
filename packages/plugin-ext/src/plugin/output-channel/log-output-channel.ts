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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Emitter } from '@theia/core/shared/vscode-languageserver-protocol';
import * as theia from '@theia/plugin';

import { OutputChannelRegistryMain, PluginInfo } from '../../common/plugin-api-rpc';
import { OutputChannelImpl } from './output-channel-item';
import { LogLevel } from '../types-impl';

export class LogOutputChannelImpl extends OutputChannelImpl implements theia.LogOutputChannel {

    readonly onDidChangeLogLevelEmitter: Emitter<theia.LogLevel> = new Emitter<theia.LogLevel>();
    readonly onDidChangeLogLevel: theia.Event<theia.LogLevel> = this.onDidChangeLogLevelEmitter.event;
    public logLevel: theia.LogLevel;

    constructor(override readonly name: string, protected override readonly proxy: OutputChannelRegistryMain, protected override readonly pluginInfo: PluginInfo) {
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
        this.info(value);
    }

    override appendLine(value: string): void {
        this.append(value + '\n');
    }

    protected log(level: theia.LogLevel, message: string): void {
        const now = new Date();
        const eol = message.endsWith('\n') ? '' : '\n';
        const logMessage = `${now.toISOString()} [${LogLevel[level]}] ${message}${eol}`;
        this.proxy.$append(this.name, logMessage, this.pluginInfo);
    }

    override dispose(): void {
        super.dispose();
        this.onDidChangeLogLevelEmitter.dispose();
    }

    // begin
    // copied from vscode: https://github.com/Microsoft/vscode/blob/main/src/vs/platform/log/common/log.ts
    /*---------------------------------------------------------------------------------------------
     *  Copyright (c) Microsoft Corporation. All rights reserved.
     *  Licensed under the MIT License. See License.txt in the project root for license information.
     *--------------------------------------------------------------------------------------------*/
    private checkLogLevel(level: theia.LogLevel): boolean {
        return this.logLevel <= level;
    }

    trace(message: string, ...args: any[]): void {
        if (this.checkLogLevel(LogLevel.Trace)) {
            this.log(LogLevel.Trace, this.format([message, ...args]));
        }
    }

    debug(message: string, ...args: any[]): void {
        if (this.checkLogLevel(LogLevel.Debug)) {
            this.log(LogLevel.Debug, this.format([message, ...args]));
        }
    }

    info(message: string, ...args: any[]): void {
        if (this.checkLogLevel(LogLevel.Info)) {
            this.log(LogLevel.Info, this.format([message, ...args]));
        }
    }

    warn(message: string, ...args: any[]): void {
        if (this.checkLogLevel(LogLevel.Warning)) {
            this.log(LogLevel.Warning, this.format([message, ...args]));
        }
    }

    error(message: string | Error, ...args: any[]): void {
        if (this.checkLogLevel(LogLevel.Error)) {
            if (message instanceof Error) {
                const array = Array.prototype.slice.call(arguments) as unknown[];
                array[0] = message.stack;
                this.log(LogLevel.Error, this.format(array));
            } else {
                this.log(LogLevel.Error, this.format([message, ...args]));
            }
        }
    }

    private format(args: any): string {
        let result = '';

        for (let i = 0; i < args.length; i++) {
            let a = args[i];

            if (typeof a === 'object') {
                try {
                    a = JSON.stringify(a);
                } catch (e) { }
            }

            result += (i > 0 ? ' ' : '') + a;
        }

        return result;
    }
    // end

}
