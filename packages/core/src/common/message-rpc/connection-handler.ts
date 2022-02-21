/********************************************************************************
 * Copyright (C) 2021 Red Hat, Inc. and others.
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
import { Channel } from './channel';
import { RpcHandler, RpcProxyHandler } from './rpc-proxy';

interface ConnectionHandler {
    onConnection(connection: Channel): void;
}

export class JsonRpcConnectionHandler<T extends object> implements ConnectionHandler {
    constructor(
        readonly path: string,
        readonly targetFactory: (proxy: T) => unknown,
    ) { }

    onConnection(connection: Channel): void {
        const proxyHandler = new RpcProxyHandler();
        // eslint-disable-next-line no-null/no-null
        const proxy = new Proxy(Object.create(null), proxyHandler);
        const target = this.targetFactory(proxy);

        new RpcHandler(target).onChannelOpen(connection);
        proxyHandler.onChannelOpen(connection);
    }
}
