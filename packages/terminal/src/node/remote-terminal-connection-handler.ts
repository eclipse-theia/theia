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

import { Disposable, DisposableCollection } from '@theia/core';
import { MessagingService } from '@theia/core/lib/node';
import { MessageConnection } from '@theia/core/shared/vscode-ws-jsonrpc';
import { Terminal } from '@theia/process/lib/node';
import { Readable } from 'stream';
import * as rt from '../common/remote-terminal-protocol';

export const RemoteTerminalConnectionHandler = Symbol('RemoteTerminalConnectionHandler');
export interface RemoteTerminalConnectionHandler {
    get(id: rt.RemoteTerminalConnectionId): RemoteTerminalConnection
}

export class RemoteTerminalConnectionHandlerImpl implements RemoteTerminalConnectionHandler, MessagingService.Contribution {

    readonly connections = new Map<rt.RemoteTerminalConnectionId, RemoteTerminalConnection>();

    configure(service: MessagingService): void {
        service.listen(rt.REMOTE_TERMINAL_NEW_CONNECTION_PATH_TEMPLATE, (params, connection) => {
            this.createRemoteTerminalConnection(params.id, connection);
        });
    }

    /**
     * Clients should create `RemoteTerminalConnection` instances
     * before trying to create or attach to terminals.
     */
    get(id: rt.RemoteTerminalConnectionId): RemoteTerminalConnection {
        const rtc = this.connections.get(id);
        if (rtc === undefined) {
            throw new Error(`unknown remote terminal connection id: ${id}`);
        }
        if (rtc.isAttached()) {
            throw new Error(`remote terminal connection is already attached id: ${id}`);
        }
        if (rtc.isDisposed()) {
            throw new Error(`remote terminal connection is disposed id: ${id}`);
        }
        return rtc;
    }

    protected createRemoteTerminalConnection(id: rt.RemoteTerminalConnectionId, connection: MessageConnection): RemoteTerminalConnection {
        if (this.connections.has(id)) {
            throw new Error(`RemoteTerminalConnection already exists id: ${id}`);
        }
        const rtc = new RemoteTerminalConnection(id, connection);
        this.connections.set(id, rtc);
        connection.onDispose(() => this.disposeRemoteTerminalConnection(id));
        return rtc;
    }

    protected disposeRemoteTerminalConnection(id: rt.RemoteTerminalConnectionId): void {
        const rtc = this.connections.get(id);
        if (rtc) {
            this.connections.delete(id);
            rtc.dispose();
        }
    }
}

/**
 * Backend object that represents the connection opened from the client.
 *
 * A `RemoteTerminalConnection` is not attached when constructed,
 * it has to be done as a second step.
 *
 * Disposing a `RemoteTerminalConnection` only disposes the underlying
 * RPC connection and buffered streams. It does not kill the actual
 * remote terminal attached to it.
 */
export class RemoteTerminalConnection implements Disposable {

    protected terminal?: Terminal;
    protected output?: Readable & Disposable;
    protected toDispose = new DisposableCollection();

    constructor(
        readonly id: rt.RemoteTerminalConnectionId,
        readonly connection: MessageConnection
    ) {
        this.toDispose.push(this.connection);
    }

    attach(terminal: Terminal): void {
        this.ensureNotDisposed();
        this.ensureNotAttached();
        this.terminal = terminal;
        this.output = this.terminal.getOutputStream();
        this.output.on('data', data => this.connection.sendNotification('onData', data));
        this.toDispose.pushAll([
            this.terminal.onExit(event => this.connection.sendNotification('onExit', event)),
            this.terminal.onClose(event => this.connection.sendNotification('onClose', event)),
            this.output,
        ]);
        this.connection.onRequest('getExitStatus', () => this.getAttachedTerminal().exitStatus);
        this.connection.onRequest('write', data => { this.getAttachedTerminal().write(data); });
        this.connection.onRequest('kill', () => { this.getAttachedTerminal().kill(); });
    }

    isAttached(): boolean {
        return this.terminal !== undefined;
    }

    isDisposed(): boolean {
        return this.toDispose.disposed;
    }

    dispose(): void {
        if (!this.toDispose.disposed) {
            this.toDispose.dispose();
        }
    }

    /**
     * Throws if disposed.
     */
    protected ensureNotDisposed(): void {
        if (this.isDisposed()) {
            throw new Error('this RemoteTerminalConnection is disposed');
        }
    }

    /**
     * Throws if attached.
     */
    protected ensureNotAttached(): void {
        if (this.isAttached()) {
            throw new Error('this RemoteTerminalConnection is already attached');
        }
    }

    /**
     * Throws if not attached.
     */
    protected ensureAttached(): void {
        if (!this.isAttached()) {
            throw new Error('this RemoteTerminalConnection is not attached');
        }
    }

    /**
     * Throws if not attached or disposed.
     */
    protected getAttachedTerminal(): Terminal {
        this.ensureNotDisposed();
        this.ensureAttached();
        return this.terminal!;
    }
}
