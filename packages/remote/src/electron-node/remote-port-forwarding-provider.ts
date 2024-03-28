// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { inject, injectable } from '@theia/core/shared/inversify';
import { ForwardedPort, RemotePortForwardingProvider } from '../electron-common/remote-port-forwarding-provider';
import { createServer, Server } from 'net';
import { RemoteConnectionService } from './remote-connection-service';

@injectable()
export class RemotePortForwardingProviderImpl implements RemotePortForwardingProvider {

    @inject(RemoteConnectionService)
    protected readonly connectionService: RemoteConnectionService;

    protected forwardedPorts: Map<number, Server> = new Map();

    async forwardPort(connectionPort: number, portToForward: ForwardedPort): Promise<void> {
        const currentConnection = this.connectionService.getConnectionFromPort(connectionPort);
        if (!currentConnection) {
            throw new Error(`No connection found for port ${connectionPort}`);
        }

        const server = createServer(socket => {
            currentConnection?.forwardOut(socket, portToForward.port);
        }).listen(portToForward.port, portToForward.address);
        this.forwardedPorts.set(portToForward.port, server);
    }

    async portRemoved(forwardedPort: ForwardedPort): Promise<void> {
        const proxy = this.forwardedPorts.get(forwardedPort.port);
        if (proxy) {
            proxy.close();
            this.forwardedPorts.delete(forwardedPort.port);
        }
    }

}
