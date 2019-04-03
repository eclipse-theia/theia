/********************************************************************************
 * Copyright (C) 2019 Progyan Bhattacharya
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
import { IBroadcastServer, IBroadcastClient, IBroadcastState, IBroadcastProtocol } from './broadcast-protocol';

@injectable()
export class BroadcastServer implements IBroadcastServer {

    private readonly clients: Set<IBroadcastClient>;
    private state: string | Object;

    constructor() {
        this.clients = new Set<IBroadcastClient>();
        this.state = {};
    }

    addClient(client: IBroadcastClient) {
        this.clients.add(client);
    }

    removeClient(client: IBroadcastClient) {
        this.clients.delete(client);
    }

    setState(state: IBroadcastState): Promise<IBroadcastProtocol> {
        const prevState = this.state;
        this.state = state;
        const stateUpdateMetadata: IBroadcastProtocol = { prevState, state };
        this.clients.forEach(client => client.onStateUpdate(stateUpdateMetadata));
        return Promise.resolve(stateUpdateMetadata);
    }

    getState(): Promise<IBroadcastState> {
        return Promise.resolve(this.state);
    }
}
