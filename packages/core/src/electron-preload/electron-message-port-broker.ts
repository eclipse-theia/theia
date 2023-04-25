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

// import * as uuid from 'uuid';
import { inject, injectable } from 'inversify';
import { ElectronPreloadContribution, ELECTRON_MESSAGE_PORT_IPC as ipc, TheiaIpcRenderer, TheiaIpcRendererEvent, TheiaIpcWindow } from '../electron-common';

/**
 * This component allows sending {@link MessagePort} from the browser context
 * to the Electron main context by sitting in the Electron preload context
 * and passing over messages from one context to the other.
 */
@injectable()
export class ElectronMessagePortBroker implements ElectronPreloadContribution {

    protected pending = new Set<string>();

    @inject(TheiaIpcRenderer)
    protected ipcRenderer: TheiaIpcRenderer;

    @inject(TheiaIpcWindow)
    protected ipcWindow: TheiaIpcWindow;

    preload(): void {
        this.ipcWindow.on(ipc.connectionRequest, this._onConnectionRequest, this);
        this.ipcRenderer.on(ipc.connectionResponse, this._onConnectionResponse, this);
    }

    protected _onConnectionRequest(event: MessageEvent, message: unknown): void {
        this.ipcRenderer.postMessage(ipc.connectionRequest, message, event.ports);
    }

    protected _onConnectionResponse(event: TheiaIpcRendererEvent, message: unknown): void {
        this.ipcWindow.postMessage(origin, ipc.connectionResponse, message);
    }
}
