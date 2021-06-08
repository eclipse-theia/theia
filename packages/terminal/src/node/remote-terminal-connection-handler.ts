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
    get(uuid: string): RemoteTerminalConnection
}

export class RemoteTerminalConnectionHandlerImpl implements RemoteTerminalConnectionHandler, MessagingService.Contribution {

    readonly connections = new Map<rt.RemoteTerminalConnectionId, RemoteTerminalConnection>();

    configure(service: MessagingService): void {
        service.listen(rt.REMOTE_TERMINAL_CONNECTION_PATH_TEMPLATE, (params, connection) => {
            this.createRemoteTerminalConnection(params.uuid, connection);
        });
    }

    /**
     * Clients should create `RemoteTerminalConnection` instances
     * before trying to create or attach to terminals.
     */
    get(uuid: rt.RemoteTerminalConnectionId): RemoteTerminalConnection {
        const rtc = this.connections.get(uuid);
        if (rtc === undefined) {
            throw new Error(`unknown remote terminal connection uuid: ${uuid}`);
        }
        if (rtc.isAttached) {
            throw new Error(`remote terminal connection is already attached uuid: ${uuid}`);
        }
        if (rtc.isDisposed) {
            throw new Error(`remote terminal connection is disposed uuid: ${uuid}`);
        }
        return rtc;
    }

    protected createRemoteTerminalConnection(uuid: rt.RemoteTerminalConnectionId, connection: MessageConnection): RemoteTerminalConnection {
        if (this.connections.has(uuid)) {
            throw new Error(`RemoteTerminalConnection already exists uuid: ${uuid}`);
        }
        const rtc = new RemoteTerminalConnection(uuid, connection);
        this.connections.set(uuid, rtc);
        connection.onDispose(() => this.disposeRemoteTerminalConnection(rtc));
        connection.onClose(() => this.disposeRemoteTerminalConnection(rtc));
        return rtc;
    }

    protected disposeRemoteTerminalConnection(rtc: RemoteTerminalConnection): void {
        if (this.connections.delete(rtc.uuid)) {
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
        readonly uuid: rt.RemoteTerminalConnectionId,
        readonly connection: MessageConnection
    ) {
        this.toDispose.push(this.connection);
    }

    get isDisposed(): boolean {
        return this.toDispose.disposed;
    }

    get isAttached(): boolean {
        return this.terminal !== undefined;
    }

    attach(terminal: Terminal): void {
        this.checkNotDisposed();
        this.checkNotAttached();
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

    dispose(): void {
        if (!this.toDispose.disposed) {
            this.toDispose.dispose();
        }
    }

    protected checkNotDisposed(): void {
        if (this.isDisposed) {
            throw new Error('this RemoteTerminalConnection is disposed');
        }
    }

    protected checkNotAttached(): void {
        if (this.isAttached) {
            throw new Error('this RemoteTerminalConnection is already attached');
        }
    }

    protected checkAttached(): void {
        if (!this.isAttached) {
            throw new Error('this RemoteTerminalConnection is not attached');
        }
    }

    protected getAttachedTerminal(): Terminal {
        this.checkNotDisposed();
        this.checkAttached();
        return this.terminal!;
    }
}
