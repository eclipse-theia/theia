// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import * as theia from '@theia/plugin';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { PLUGIN_RPC_CONTEXT as Ext, OutputChannelRegistryExt, OutputChannelRegistryMain, PluginInfo } from '../common/plugin-api-rpc.js';
import { RPCProtocol } from '../common/rpc-protocol.js';
import { isObject } from '../common/types.js';
import { LogLevel } from './types-impl.js';
import { LogOutputChannelImpl } from './output-channel/log-output-channel.js';
import { OutputChannelImpl } from './output-channel/output-channel-item.js';

export class OutputChannelRegistryExtImpl implements OutputChannelRegistryExt {

    proxy: OutputChannelRegistryMain;

    protected readonly logChannels = new Map<string, LogOutputChannelImpl>();

    protected _globalLogLevel: theia.LogLevel = LogLevel.Info;
    protected readonly globalLogLevelChangeEmitter = new Emitter<theia.LogLevel>();
    readonly onDidChangeGlobalLogLevel: Event<theia.LogLevel> = this.globalLogLevelChangeEmitter.event;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.OUTPUT_CHANNEL_REGISTRY_MAIN);
    }

    get globalLogLevel(): theia.LogLevel {
        return this._globalLogLevel;
    }

    createOutputChannel(name: string, pluginInfo: PluginInfo): theia.OutputChannel;
    createOutputChannel(name: string, pluginInfo: PluginInfo, options: { log: true; }): theia.LogOutputChannel;
    createOutputChannel(name: string, pluginInfo: PluginInfo, options?: { log: true; }): theia.OutputChannel | theia.LogOutputChannel {
        name = name.trim();
        if (!name) {
            throw new Error('illegal argument \'name\'. must not be falsy');
        }
        const isLogOutput = options && isObject(options);
        return isLogOutput
            ? this.doCreateLogOutputChannel(name, pluginInfo)
            : this.doCreateOutputChannel(name, pluginInfo);
    }

    private doCreateOutputChannel(name: string, pluginInfo: PluginInfo): OutputChannelImpl {
        return new OutputChannelImpl(name, this.proxy, pluginInfo);
    }

    private doCreateLogOutputChannel(name: string, pluginInfo: PluginInfo): LogOutputChannelImpl {
        const existing = this.logChannels.get(name);
        if (existing) {
            return existing;
        }
        const channel = new LogOutputChannelImpl(name, this.proxy, pluginInfo, this._globalLogLevel, () => this.logChannels.delete(name));
        this.logChannels.set(name, channel);
        this.proxy.$registerLogChannel(name);
        return channel;
    }

    $setLogLevel(channelName: string, logLevel: number): void {
        this.logChannels.get(channelName)?.setLogLevel(logLevel);
    }

    $setGlobalLogLevel(logLevel: number): void {
        if (this._globalLogLevel !== logLevel) {
            this._globalLogLevel = logLevel;
            this.globalLogLevelChangeEmitter.fire(logLevel);
        }
    }
}
