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

import { URI } from '@theia/core/shared/vscode-uri';
import { WindowState } from '@theia/plugin';
import { WindowStateExt, WindowMain, PLUGIN_RPC_CONTEXT } from '../common/plugin-api-rpc';
import { Event, Emitter } from '@theia/core/lib/common/event';
import { RPCProtocol } from '../common/rpc-protocol';
import { Schemes } from '../common/uri-components';

export class WindowStateExtImpl implements WindowStateExt {

    private windowStateCached: WindowState;

    private windowStateChangedEmitter = new Emitter<WindowState>();
    public readonly onDidChangeWindowState: Event<WindowState> = this.windowStateChangedEmitter.event;

    private readonly proxy: WindowMain;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.WINDOW_MAIN);
        this.windowStateCached = { focused: true }; // supposed tab is active on start
    }

    getWindowState(): WindowState {
        return this.windowStateCached;
    }

    $onWindowStateChanged(focused: boolean): void {
        const state = { focused: focused };
        if (state === this.windowStateCached) {
            return;
        }

        this.windowStateCached = state;
        this.windowStateChangedEmitter.fire(state);
    }

    openUri(uri: URI): Promise<boolean> {
        return this.proxy.$openUri(uri);
    }

    async asExternalUri(target: URI): Promise<URI> {
        if (!target.scheme.trim().length) {
            throw new Error('Invalid scheme - cannot be empty');
        }
        if (Schemes.http !== target.scheme && Schemes.https !== target.scheme) {
            throw new Error(`Invalid scheme '${target.scheme}'`);
        }

        const uri = await this.proxy.$asExternalUri(target);
        return URI.revive(uri);
    }

}
