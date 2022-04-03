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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { injectable } from 'inversify';
import { pushDisposableListener } from '../../common/node-event-utils';
import { AbstractConnection, Connection, ConnectionState, serviceIdentifier } from '../../common';

export const NodeIpcConnectionFactory = serviceIdentifier<NodeIpcConnectionFactory>('NodeIpcConnectionFactory');
export type NodeIpcConnectionFactory = (proc: ProcessLike) => Connection<any>;

export interface ProcessLike extends NodeJS.EventEmitter {
    disconnect(): void
    on(event: 'message', listener: (message: any) => void): this
    on(event: 'disconnect', listener: () => void): this
    send?(message: any): void
}

@injectable()
export class NodeIpcConnection extends AbstractConnection<any> {

    state = ConnectionState.OPENING;

    protected proc?: ProcessLike;

    initialize(proc: ProcessLike): this {
        this.proc = proc;
        if (typeof this.proc.send !== 'function') {
            this.dispose();
            throw new Error('cannot communicate with process through Node\'s IPC');
        }
        pushDisposableListener(this.disposables, this.proc, 'message', message => {
            this.onMessageEmitter.fire(message);
        });
        pushDisposableListener(this.disposables, this.proc, 'disconnect', () => {
            if (this.state !== ConnectionState.CLOSED) {
                this.dispose();
            }
        });
        this.setOpenedAndEmit();
        return this;
    }

    sendMessage(message: string | object): void {
        this.ensureState(ConnectionState.OPENED);
        this.proc!.send!(message);
    }

    close(): void {
        this.dispose();
        this.proc!.disconnect();
        this.proc = undefined;
    }

    override dispose(): void {
        this.setClosedAndEmit();
        super.dispose();
    }
}
