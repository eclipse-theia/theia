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

import { MAIN_RPC_CONTEXT, ConnectionMain, ConnectionExt } from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import { PluginConnection } from '../../common/connection';
import { PluginMessageReader } from '../../common/plugin-message-reader';
import { PluginMessageWriter } from '../../common/plugin-message-writer';

/**
 * Implementation of connection system of the plugin API.
 * Creates holds the connections to the plugins. Allows to send a message to the plugin by getting already created connection via id.
 */
export class ConnectionMainImpl implements ConnectionMain {
    private proxy: ConnectionExt;
    private connections = new Map<string, PluginConnection>();
    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.CONNECTION_EXT);
    }

    /**
     * Gets the connection between plugin by id and sends string message to it.
     *
     * @param id connection's id
     * @param message incoming message
     */
    $sendMessage(id: string, message: string): void {
        if (this.connections.has(id)) {
            this.connections.get(id)!.reader.readMessage(message);
        }
    }

    /**
     * Creates instances of message reader and writer and
     * asks to create a connection between the plugin. throws an error if the connection with this id has already registered.
     *
     * @param id id to register new connection
     */
    async createConnection(id: string): Promise<PluginConnection> {
        if (this.connections.has(id)) {
            throw new Error(`Connection ${id} already exists`);
        }

        const reader = new PluginMessageReader();
        const writer = new PluginMessageWriter(id, this.proxy);
        const connection = new PluginConnection(reader, writer, () => {
            this.connections.delete(id);
            this.proxy.$deleteConnection(id);
        });

        this.connections.set(id, connection);
        await this.proxy.$createConnection(id);

        return Promise.resolve(connection);
    }
}
