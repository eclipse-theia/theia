// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { AbstractConnection, Connection, ConnectionState, serviceIdentifier } from '../../common';

export const NodeIpcConnectionFactory = serviceIdentifier<NodeIpcConnectionFactory>('NodeIpcConnectionFactory');
export type NodeIpcConnectionFactory = (proc: ProcessLike) => Connection<string | object>;

export interface ProcessLike {
    disconnect(): void
    on(event: 'message', callback: (message: string | object) => void): void
    once(event: 'disconnect', callback: () => void): void
    send?(message: string | object): void
}

export class NodeIpcConnection extends AbstractConnection<string | object> {

    state = ConnectionState.CLOSED;

    protected proc?: ProcessLike;

    initialize(proc: ProcessLike): this {
        this.proc = proc;
        if (typeof this.proc.send !== 'function') {
            this.state = ConnectionState.CLOSED;
            throw new Error('cannot communicate with process through Node\'s IPC');
        }
        this.state = ConnectionState.OPENED;
        this.proc.once('disconnect', () => {
            this.state = ConnectionState.CLOSED;
            this._onCloseEmitter.fire();
        });
        this.proc.on('message', message => this._onMessageEmitter.fire(message));
        return this;
    }

    sendMessage(message: string | object): void {
        this.proc!.send!(message);
    }

    close(): void {
        this.proc!.disconnect();
    }
}
