/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
