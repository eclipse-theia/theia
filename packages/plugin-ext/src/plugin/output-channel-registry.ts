/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import {
    PLUGIN_RPC_CONTEXT as Ext, OutputChannelRegistryMain
} from '../api/plugin-api';
import { RPCProtocol } from '../api/rpc-protocol';
import * as theia from '@theia/plugin';
import { OutputChannelImpl } from './output-channel/output-channel-item';

export class OutputChannelRegistryExt {

    proxy: OutputChannelRegistryMain;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.OUTPUT_CHANNEL_REGISTRY_MAIN);
    }

    createOutputChannel(name: string): theia.OutputChannel {
        name = name.trim();
        if (!name) {
            throw new Error('illegal argument \'name\'. must not be falsy');
        } else {
            return new OutputChannelImpl(name, this.proxy);
        }
    }
}
