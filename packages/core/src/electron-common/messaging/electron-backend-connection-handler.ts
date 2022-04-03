// *****************************************************************************
// Copyright (C) 2022 TypeFox and others.
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

import { ConnectionHandler } from '../../common/messaging/handler';

/**
 * Name of the channel used with `process.on/message`.
 */
export const THEIA_ELECTRON_BACKEND_IPC_CHANNEL_NAME = 'theia-electron-backend-ipc';

export interface ElectronBackendMessage {
    [THEIA_ELECTRON_BACKEND_IPC_CHANNEL_NAME]: string
}

export namespace ElectronBackendMessage {
    export function is(message: unknown): message is ElectronBackendMessage {
        return typeof message === 'object' && !!message && THEIA_ELECTRON_BACKEND_IPC_CHANNEL_NAME in message;
    }
    export function get(message: ElectronBackendMessage): string {
        return message[THEIA_ELECTRON_BACKEND_IPC_CHANNEL_NAME];
    }
    export function create(data: string): ElectronBackendMessage {
        return { [THEIA_ELECTRON_BACKEND_IPC_CHANNEL_NAME]: data };
    }
}

/**
 * A class capable of piping messaging data from the backend server to the electron main application.
 * This should only be used when the app runs in `--no-cluster` mode, since we can't use normal inter-process communication.
 */
export class ElectronBackendMessagePipe {

    protected electronHandler?: (data: string) => void;
    protected backendHandler?: (data: string) => void;

    onMessage(from: 'backend' | 'electron', handler: (data: string) => void): boolean {
        if (from === 'backend') {
            this.electronHandler = handler;
            return !!this.backendHandler;
        } else {
            this.backendHandler = handler;
            return !!this.electronHandler;
        }
    }

    pushMessage(to: 'backend' | 'electron', data: string): boolean {
        if (to === 'backend') {
            this.electronHandler?.(data);
            return !!this.electronHandler;
        } else {
            this.backendHandler?.(data);
            return !!this.backendHandler;
        }
    }

}

export const ElectronBackendConnectionPipe = new ElectronBackendMessagePipe();

/**
 * IPC-specific connection handler.
 * Use this if you want to establish communication from the electron-main to the backend process.
 */
export const ElectronMainConnectionHandler = Symbol('ElectronBackendConnectionHandler');

export interface ElectronMainConnectionHandler extends ConnectionHandler {
}
