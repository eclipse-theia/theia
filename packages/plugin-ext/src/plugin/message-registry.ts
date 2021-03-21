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
    PLUGIN_RPC_CONTEXT as Ext, MessageRegistryMain, MainMessageOptions, MainMessageType
} from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { MessageItem, MessageOptions } from '@theia/plugin';

export class MessageRegistryExt {

    private proxy: MessageRegistryMain;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.MESSAGE_REGISTRY_MAIN);
    }

    async showMessage(type: MainMessageType, message: string,
        optionsOrFirstItem?: MessageOptions | string | MessageItem,
        ...rest: (string | MessageItem)[]): Promise<string | MessageItem | undefined> {
        const options: MainMessageOptions = {};
        const actions: MessageItem[] = [];
        const items: (string | MessageItem)[] = [];
        const pushItem = (item: string | MessageItem) => {
            items.push(item);
            if (typeof item === 'string') {
                actions.push({ title: item });
            } else {
                actions.push({ title: item.title, isCloseAffordance: item.isCloseAffordance });
                if (item.isCloseAffordance) {
                    options.onCloseActionHandle = actions.length - 1;
                }
            }
        };
        if (optionsOrFirstItem) {
            if (typeof optionsOrFirstItem === 'string' || 'title' in optionsOrFirstItem) {
                pushItem(optionsOrFirstItem);
            } else {
                if ('modal' in optionsOrFirstItem) {
                    options.modal = optionsOrFirstItem.modal;
                }
            }
        }
        for (const item of rest) {
            pushItem(item);
        }
        const actionHandle = await this.proxy.$showMessage(type, message, options, actions);
        return actionHandle !== undefined ? items[actionHandle] : undefined;
    }

}
