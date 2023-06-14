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
import { PLUGIN_RPC_CONTEXT as Ext, OutputChannelRegistryExt, OutputChannelRegistryMain, PluginInfo } from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { isObject } from '../common/types';
import { LogOutputChannelImpl } from './output-channel/log-output-channel';
import { OutputChannelImpl } from './output-channel/output-channel-item';

export class OutputChannelRegistryExtImpl implements OutputChannelRegistryExt {

    proxy: OutputChannelRegistryMain;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.OUTPUT_CHANNEL_REGISTRY_MAIN);
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
        return new LogOutputChannelImpl(name, this.proxy, pluginInfo);
    }
}
