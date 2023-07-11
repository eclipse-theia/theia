// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from 'inversify';
import { TheiaIpcWindow } from '../browser';
import { RpcPortForwardMessage, THEIA_RPC_CHANNELS as ipc } from '../common';
import { TheiaIpcRenderer } from './ipc-renderer';
import { ElectronPreloadContribution } from './preload-contribution';

/**
 * This component forwards messages with {@link MessagePort} from the frontend
 * context to the main context.
 */
@injectable()
export class ElectronPreloadRpcBroker implements ElectronPreloadContribution {

    @inject(TheiaIpcRenderer)
    protected ipcRenderer: TheiaIpcRenderer;

    @inject(TheiaIpcWindow)
    protected ipcWindow: TheiaIpcWindow;

    preload(): void {
        this.ipcWindow.on(ipc.portForward, this.handlePortForward, this);
    }

    protected handlePortForward(event: MessageEvent, message: RpcPortForwardMessage): void {
        this.ipcRenderer.postMessage(ipc.portForward, message, event.ports);
    }
}
