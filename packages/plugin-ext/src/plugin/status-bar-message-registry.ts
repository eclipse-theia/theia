/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
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
