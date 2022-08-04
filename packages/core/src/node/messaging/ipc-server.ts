
// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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
import { createServer, Server, Socket } from 'net';
import { v4 } from 'uuid';
export const THEIA_IPC_SERVER = 'THEIA_IPC_SERVER';
/**
 * Can be used to setup a named-pipe communication between processes.
 * Used for establishing an inter-process RPC-protocol.
 */
export interface IpcServer {
    name: string
    server: Server
    client: Promise<Socket>
}

export function createIpcServer(): IpcServer {
    const name = createIpcServerName();
    const server = createServer();
    server.maxConnections = 1;
    const client = new Promise<Socket>(resolve => {
        server.once('connection', socket => {
            socket.once('close', () => server.close());
            resolve(socket);
        });
    });
    server.listen(name, 0);
    return { name, server, client };
}

export function createIpcServerName(): string {
    return process.platform === 'win32'
        ? `\\\\.\\pipe\\${v4()}`
        : `/tmp/pipe-${v4()}`;
}

