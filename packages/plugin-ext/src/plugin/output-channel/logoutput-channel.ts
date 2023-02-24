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

import { AbstractMessageLogger, DEFAULT_LOG_LEVEL, LogLevel } from '@theia/monaco-editor-core/esm/vs/platform/log/common/log';
import * as theia from '@theia/plugin';

import { OutputChannelRegistryMain, PluginInfo } from '../../common/plugin-api-rpc';
import { toLogLevel } from '../type-converters';

export class LogOutputChannelImpl extends AbstractMessageLogger implements theia.LogOutputChannel {

    private _disposed: boolean = false;
    get disposed(): boolean { return this._disposed; }

    override onDidChangeLogLevel: theia.Event<theia.LogLevel>;

    constructor(readonly name: string, protected proxy: OutputChannelRegistryMain, protected readonly pluginInfo: PluginInfo) {
        super();
        this.setLevel(DEFAULT_LOG_LEVEL);
    }

    get logLevel(): theia.LogLevel {
        return toLogLevel(this.getLevel());
    }

    append(value: string): void {
        this.info(value);
    }

    appendLine(value: string): void {
        this.append(value + '\n');
    }

    replace(value: string): void {
        this.info(value);
        this.proxy.$append(this.name, value, this.pluginInfo);
    }

    clear(): void {
        this.proxy.$clear(this.name);
    }

    show(columnOrPreserveFocus?: theia.ViewColumn | boolean, preserveFocus?: boolean): void {
        this.proxy.$reveal(this.name, !!(typeof columnOrPreserveFocus === 'boolean' ? columnOrPreserveFocus : preserveFocus));
    }

    hide(): void {
        this.proxy.$close(this.name);
    }

    protected log(level: LogLevel, message: string): void {
        const now = new Date(Date.now());
        const eol = message.endsWith('\n') ? '' : '\n';
        const logMessage = `${now.toISOString()} [${LogLevel[level]}] ${message}${eol}`;
        this.proxy.$append(this.name, logMessage, this.pluginInfo);
    }

    override dispose(): void {
        super.dispose();

        if (!this._disposed) {
            this.proxy.$dispose(this.name);
            this._disposed = true;
        }
    }

}
