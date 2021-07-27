/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import type * as NodeWebSocket from 'ws';
import { Connection } from './connection';

/**
 * Wrapper around frontend and backend WebSocket implementations.
 */
export class WebSocketConnection extends Connection.AbstractBase {

    get state(): Connection.State {
        switch (this.ws.readyState) {
            case WebSocket.CONNECTING: return Connection.State.Opening;
            case WebSocket.OPEN: return Connection.State.Open;
            case WebSocket.CLOSING: return Connection.State.Closing;
            case WebSocket.CLOSED: return Connection.State.Closed;
        }
        throw new Error(`unhandled readyState: ${this.ws.readyState}`);
    }

    /**
     * @param ws Either the browser's `WebSocket` implementation or Node's `ws` implementation.
     */
    constructor(
        protected ws: WebSocket | NodeWebSocket
    ) {
        super();
        // `WebSocket.addEventListener` and `NodeWebSocket.addEventListener` are compatible
        // despite TypeScript complaining about it, so we'll force it a bit:
        (this.ws as WebSocket).addEventListener('open', () => this.onOpenEmitter.fire(this));
        (this.ws as WebSocket).addEventListener('message', event => this.onMessageEmitter.fire(event.data));
        (this.ws as WebSocket).addEventListener('error', event => this.onErrorEmitter.fire(event.type));
        (this.ws as WebSocket).addEventListener('close', event => this.onCloseEmitter.fire({ code: event.code, reason: event.reason }));
    }

    sendMessage(message: string): void {
        Connection.ensureOpened(this);
        this.ws.send(message);
    }

    close(event: CloseEvent): void {
        Connection.ensureNotClosing(this);
        Connection.ensureNotClosed(this);
        this.ws.close(event.code, event.reason);
    }
}
