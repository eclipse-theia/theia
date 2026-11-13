// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
import { Disposable } from '@theia/core/lib/common/disposable';
import { Emitter } from '@theia/core/lib/common/event';
import { DebugChannel } from '@theia/debug/lib/common/debug-service';
import { ConnectionExt, ConnectionMain } from './plugin-api-rpc.js';

/**
 * A channel communicating with a counterpart in a plugin host.
 */
export class PluginChannel implements DebugChannel {
    private messageEmitter: Emitter<string> = new Emitter();
    private errorEmitter: Emitter<unknown> = new Emitter();
    private closedEmitter: Emitter<void> = new Emitter();
    private closed = false;

    constructor(
        protected readonly id: string,
        protected readonly connection: ConnectionExt | ConnectionMain) { }

    send(content: string): void {
        this.connection.$sendMessage(this.id, content);
    }

    fireMessageReceived(msg: string): void {
        this.messageEmitter.fire(msg);
    }

    fireError(error: unknown): void {
        this.errorEmitter.fire(error);
    }

    fireClosed(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.closedEmitter.fire();
        this.messageEmitter.dispose();
        this.errorEmitter.dispose();
        this.closedEmitter.dispose();
    }

    onMessage(cb: (message: string) => void): void {
        this.messageEmitter.event(cb);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError(cb: (reason: any) => void): void {
        this.errorEmitter.event(cb);
    }

    onClose(cb: (code: number, reason: string) => void): void {
        this.closedEmitter.event(() => cb(-1, 'closed'));
    }

    close(): void {
        this.connection.$deleteConnection(this.id);
    }
}

export class ConnectionImpl implements ConnectionMain, ConnectionExt, Disposable {
    private readonly proxy: ConnectionExt | ConnectionExt;
    private readonly connections = new Map<string, PluginChannel>();
    private disposed = false;

    constructor(proxy: ConnectionMain | ConnectionExt) {
        this.proxy = proxy;
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        const connections = Array.from(this.connections.values());
        this.connections.clear();
        for (const connection of connections) {
            // The RPC peer is gone: notify locally instead of sending a delete request.
            connection.fireClosed();
        }
    }

    protected checkDisposed(): void {
        if (this.disposed) {
            throw new Error('Plugin connection is disposed');
        }
    }

    /**
     * Gets the connection between plugin by id and sends string message to it.
     *
     * @param id connection's id
     * @param message incoming message
     */
    async $sendMessage(id: string, message: string): Promise<void> {
        if (this.connections.has(id)) {
            this.connections.get(id)!.fireMessageReceived(message);
        } else {
            console.warn(`Received message for unknown connection: ${id}`);
        }
    }

    /**
     * Instantiates a new connection by the given id.
     * @param id the connection id
     */
    async $createConnection(id: string): Promise<void> {
        console.debug(`Creating plugin connection: ${id}`);

        await this.doEnsureConnection(id);
    }

    /**
     * Deletes a connection.
     * @param id the connection id
     */
    async $deleteConnection(id: string): Promise<void> {
        console.debug(`Deleting plugin connection: ${id}`);
        const connection = this.connections.get(id);
        if (connection) {
            this.connections.delete(id);
            connection.fireClosed();
        }
    }

    /**
     * Returns existed connection or creates a new one.
     * @param id the connection id
     */
    async ensureConnection(id: string): Promise<PluginChannel> {
        console.debug(`Creating local connection: ${id}`);
        const connection = await this.doEnsureConnection(id);
        this.checkDisposed();
        await this.proxy.$createConnection(id);
        this.checkDisposed();
        return connection;
    }

    /**
     * Returns existed connection or creates a new one.
     * @param id the connection id
     */
    async doEnsureConnection(id: string): Promise<PluginChannel> {
        this.checkDisposed();
        const connection = this.connections.get(id) || await this.doCreateConnection(id);
        if (this.disposed) {
            connection.fireClosed();
            this.checkDisposed();
        }
        this.connections.set(id, connection);
        return connection;
    }

    protected async doCreateConnection(id: string): Promise<PluginChannel> {
        const channel = new PluginChannel(id, this.proxy);
        channel.onClose(() => this.connections.delete(id));
        return channel;
    }
}
