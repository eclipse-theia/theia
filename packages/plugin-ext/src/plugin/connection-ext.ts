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
     * When main side calls this method it finds related connection by id and sends message to the message reader.
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
     * Deletes the connection by id.
     *
     * @param id connection's id
     */
    $deleteConnection(id: string): Promise<void> {
        if (this.connections.has(id)) {
            this.connections.delete(id);
        }
        return Promise.resolve();
    }

    /**
     * Registers new connection by id.
     *
     * @param id connection's id
     */
    $createConnection(id: string): Promise<void> {
        if (this.connections.has(id)) {
            throw new Error(`Connection ${id} already exists`);
        }

        const reader = new PluginMessageReader();
        const writer = new PluginMessageWriter(id, this.proxy);
        const connection = new PluginConnection(reader, writer, () => {
            this.connections.delete(id);
        });

        this.connections.set(id, connection);

        return Promise.resolve();
    }

}
