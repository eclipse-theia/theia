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

import { Connection } from './connection';
import { DisposableCollection } from '../disposable';

/**
 * Sometimes we may use connections that didn't require an initial request to
 * connect the two peers. In such a scenario, one peer might start using the
 * connection before the remote peer started listening (timing issue).
 *
 * This method runs a small handshake protocol on {@link connection} to make
 * sure that both peers are listening before running other protocols.
 *
 * _e.g. Using Node's fork IPC channel: the channel is established as the
 * process is forked, but listeners are only eventually attached once the
 * running code initializes itself asynchronously._
 */
export function waitForRemote<C extends Connection<any>>(connection: C): Promise<C> {
    return new Promise((resolve, reject) => {
        const disposables = new DisposableCollection();
        connection.onClose(() => {
            disposables.dispose();
            reject(new Error('connection closed'));
        }, undefined, disposables);
        let received_ping_once = false;
        connection.onMessage((message: PingMessage) => {
            if (message === PingMessage.PING) {
                if (!received_ping_once) {
                    received_ping_once = true;
                    // Resend ping in case our initial ping wasn't received.
                    // (e.g. the remote peer wasn't listening yet.)
                    // If it was received, this second ping will be ignored.
                    connection.sendMessage(PingMessage.PING);
                    connection.sendMessage(PingMessage.PONG);
                }
            } else if (message === PingMessage.PONG) {
                resolve(connection);
                disposables.dispose();
            } else {
                console.warn('ping/pong: unexpected message:', message);
            }
        }, undefined, disposables);
        connection.sendMessage(PingMessage.PING);
    });
}

export enum PingMessage {
    PING = 'ping',
    PONG = 'pong'
}
