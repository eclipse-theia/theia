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

import { createMessageConnection, IPCMessageReader, IPCMessageWriter } from 'vscode-jsonrpc/node';
import { DefaultJsonRpc } from '../common/json-rpc';
import { DefaultReflection } from '../common/reflection';
import { DefaultRpc } from '../common/rpc';
import { checkParentAlive } from './ipc';

/**
 * Serve requests made to {@link server} over stdin/stdout using JSON-RPC.
 *
 * This is meant to be used in a sub-process entry-point.
 */
export function serve(server: object): void {
    checkParentAlive();
    const reflection = new DefaultReflection();
    const rpcProxying = new DefaultRpc(reflection);
    const jsonRpc = new DefaultJsonRpc();
    const reader = new IPCMessageReader(process);
    const writer = new IPCMessageWriter(process);
    const messageConnection = createMessageConnection(reader, writer, console);
    const rpcConnection = jsonRpc.createRpcConnection(messageConnection);
    rpcProxying.serve(server, rpcConnection);
}
