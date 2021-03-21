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
import { Disposable, StatusBarAlignment } from './types-impl';
import { StatusBarItem } from '@theia/plugin';
import {
    PLUGIN_RPC_CONTEXT as Ext, StatusBarMessageRegistryMain
} from '../common/plugin-api-rpc';
import { RPCProtocol } from '../common/rpc-protocol';
import { StatusBarItemImpl } from './status-bar/status-bar-item';

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export class StatusBarMessageRegistryExt {

    proxy: StatusBarMessageRegistryMain;

    protected readonly statusMessage: StatusBarMessage;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.STATUS_BAR_MESSAGE_REGISTRY_MAIN);
        this.statusMessage = new StatusBarMessage(this);
    }

    // copied from https://github.com/Microsoft/vscode/blob/6c8f02b41db9ae5c4d15df767d47755e5c73b9d5/src/vs/workbench/api/node/extHostStatusBar.ts#L174
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setStatusBarMessage(text: string, timeoutOrThenable?: number | PromiseLike<any>): Disposable {
        const d = this.statusMessage.setMessage(text);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let handle: any;

        if (typeof timeoutOrThenable === 'number') {
            handle = setTimeout(() => d.dispose(), timeoutOrThenable);
        } else if (typeof timeoutOrThenable !== 'undefined') {
            timeoutOrThenable.then(() => d.dispose(), () => d.dispose());
        }

        return new Disposable(() => {
            d.dispose();
            clearTimeout(handle);
        });

    }

    createStatusBarItem(alignment?: StatusBarAlignment, priority?: number): StatusBarItem {
        return new StatusBarItemImpl(this.proxy, alignment, priority);
    }
}

// copied from https://github.com/Microsoft/vscode/blob/6c8f02b41db9ae5c4d15df767d47755e5c73b9d5/src/vs/workbench/api/node/extHostStatusBar.ts#L122
class StatusBarMessage {

    private _item: StatusBarItem;
    private _messages: { message: string }[] = [];

    constructor(statusBar: StatusBarMessageRegistryExt) {
        this._item = statusBar.createStatusBarItem(StatusBarAlignment.Left, Number.MIN_VALUE);
    }

    dispose(): void {
        this._messages.length = 0;
        this._item.dispose();
    }

    setMessage(message: string): Disposable {
        const data: { message: string } = { message }; // use object to not confuse equal strings
        this._messages.unshift(data);
        this._update();

        return new Disposable(() => {
            const idx = this._messages.indexOf(data);
            if (idx >= 0) {
                this._messages.splice(idx, 1);
                this._update();
            }
        });
    }

    private _update(): void {
        if (this._messages.length > 0) {
            this._item.text = this._messages[0].message;
            this._item.show();
        } else {
            this._item.hide();
        }
    }
}
