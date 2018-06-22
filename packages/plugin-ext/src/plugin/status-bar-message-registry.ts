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
import {Disposable, StatusBarAlignment} from './types-impl';
import {StatusBarItem} from '@theia/plugin';
import {
    PLUGIN_RPC_CONTEXT as Ext, StatusBarMessageRegistryMain
} from '../api/plugin-api';
import {RPCProtocol} from '../api/rpc-protocol';
import {StatusBarItemImpl} from "./status-bar/status-bar-item";

export class StatusBarMessageRegistryExt {

    proxy: StatusBarMessageRegistryMain;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.STATUS_BAR_MESSAGE_REGISTRY_MAIN);
    }

    setStatusBarMessage(text: string, arg?: number | PromiseLike<any>): Disposable {
        let id: string;
        this.proxy.$setMessage(text, 0, 1, undefined, undefined, undefined).then((messageId: string) => {
            id = messageId;
        });
        let handle: NodeJS.Timer;

        if (typeof arg === 'number') {
            handle = setTimeout(() => this.dispose(id), <number>arg);
        } else if (typeof arg !== 'undefined') {
            arg.then(() => this.dispose(id), () => this.dispose(id));
        }

        return Disposable.create(() => {
            this.dispose(id);
            if (handle) {
                clearTimeout(handle);
            }
        });
    }

    private dispose(id: string): void {
        if (!id) {
            return;
        }
        this.proxy.$dispose(id);
    }

    createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem {
        return new StatusBarItemImpl(this.proxy, alignment, priority);
    }
}
