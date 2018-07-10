/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import {
    PLUGIN_RPC_CONTEXT as Ext, MessageRegistryMain
} from '../api/plugin-api';
import {RPCProtocol} from '../api/rpc-protocol';
import {MessageItem, MessageOptions} from "@theia/plugin";

export class MessageRegistryExt {

    private proxy: MessageRegistryMain;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.MESSAGE_REGISTRY_MAIN);
    }

    showInformationMessage(message: string,
                           optionsOrFirstItem: MessageOptions | string | MessageItem,
                           items: string[] | MessageItem[]): PromiseLike<string | MessageItem | undefined> {
        return this.proxy.$showInformationMessage(message, optionsOrFirstItem, items);
    }

    showWarningMessage(message: string,
                           optionsOrFirstItem: MessageOptions | string | MessageItem,
                           items: string[] | MessageItem[]): PromiseLike<string | MessageItem | undefined> {
        return this.proxy.$showWarningMessage(message, optionsOrFirstItem, items);
    }

    showErrorMessage(message: string,
                           optionsOrFirstItem: MessageOptions | string | MessageItem,
                           items: string[] | MessageItem[]): PromiseLike<string | MessageItem | undefined> {
        return this.proxy.$showErrorMessage(message, optionsOrFirstItem, items);
    }
}
