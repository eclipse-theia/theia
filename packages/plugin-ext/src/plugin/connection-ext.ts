/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { ConnectionExt, PLUGIN_RPC_CONTEXT, ConnectionMain } from '../api/plugin-api';
import { RPCProtocol } from '../api/rpc-protocol';
import { PluginConnection } from '../common/connection';
import { PluginMessageReader } from '../common/plugin-message-reader';
import { PluginMessageWriter } from '../common/plugin-message-writer';

/**
 * Implementation of connection system of the plugin API.
 * It allows to communicate with main side to send and read messages.
 */
export class ConnectionExtImpl implements ConnectionExt {
    private proxy: ConnectionMain;
    private connections = new Map<string, PluginConnection>();
    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.CONNECTION_MAIN);
    }

    /**
     * Gets the connection between plugin by id and sends string message to it.
     *
     * @param id connection's id
     * @param message incoming message
     */
    async $sendMessage(id: string, message: string): Promise<void> {
        if (this.connections.has(id)) {
            this.connections.get(id)!.reader.readMessage(message);
        } else {
            console.warn('It is not possible to read message. Connection missed.');
        }
    }

    /**
     * Instantiates a new connection by the given id.
     * @param id the connection id
     */
    async $createConnection(id: string): Promise<void> {
        await this.doEnsureConnection(id);
    }

    /**
     * Deletes a connection.
     * @param id the connection id
     */
    async $deleteConnection(id: string): Promise<void> {
        this.connections.delete(id);
    }

    /**
     * Returns existed connection or creates a new one.
     * @param id the connection id
     */
    async ensureConnection(id: string): Promise<PluginConnection> {
        const connection = await this.doEnsureConnection(id);
        this.proxy.$createConnection(id);
        return connection;
    }

    /**
     * Returns existed connection or creates a new one.
     * @param id the connection id
     */
    async doEnsureConnection(id: string): Promise<PluginConnection> {
        const connection = this.connections.get(id) || await this.doCreateConnection(id);
        this.connections.set(id, connection);
        return connection;
    }

    protected async doCreateConnection(id: string): Promise<PluginConnection> {
        const reader = new PluginMessageReader();
        const writer = new PluginMessageWriter(id, this.proxy);
        return new PluginConnection(
            reader,
            writer,
            () => {
                this.connections.delete(id);
                this.proxy.$deleteConnection(id);
            });
    }
}
