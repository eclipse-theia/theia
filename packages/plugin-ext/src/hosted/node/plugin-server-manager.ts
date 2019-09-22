/********************************************************************************
 * Copyright (C) 2019 TypeFox and others.
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

import { injectable } from 'inversify';
import { HostedPluginServer, HostedPluginClient } from '../../common/plugin-protocol';
import { JsonRpcProxy } from '@theia/core/lib/common/messaging/proxy-factory';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';

@injectable()
export class PluginServerManager {

    protected readonly servers = new Map<string, HostedPluginServer>();

    initialize(server: HostedPluginServer, client: JsonRpcProxy<HostedPluginClient>): HostedPluginServer {
        const toDispose = new DisposableCollection(server);
        client.onDidCloseConnection(() => toDispose.dispose());
        this.doInitialize(server, client, toDispose);
        return server;
    }

    protected async doInitialize(server: HostedPluginServer, client: HostedPluginClient, toDispose: DisposableCollection): Promise<void> {
        const result = await client.initialize();
        if (toDispose.disposed) {
            toDispose.dispose();
            return;
        }
        server.setClient(client);
        this.servers.set(result.clientId, server);
        toDispose.push(Disposable.create(() => this.servers.delete(result.clientId)));
    }

    get(clientId: string): HostedPluginServer | undefined {
        return this.servers.get(clientId);
    }

}
