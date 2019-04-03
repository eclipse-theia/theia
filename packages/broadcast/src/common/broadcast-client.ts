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

import { inject, injectable, postConstruct } from 'inversify';
import { IBroadcastProtocol, IBroadcastClientDispatch, IBroadcastServer, IBroadcastState, onStateUpdateHandler } from './broadcast-protocol';
import { BroadcastWatcher } from './broadcast-watcher';

@injectable()
export class BroadcastClientDispatch implements IBroadcastClientDispatch {

    @inject(BroadcastWatcher)
    private readonly watcher: BroadcastWatcher;

    @inject(IBroadcastServer)
    private readonly server: IBroadcastServer;

    @postConstruct()
    onStateUpdate(callback: onStateUpdateHandler) {
        this.watcher.onStateUpdate(callback);
    }

    @postConstruct()
    getState(): Promise<IBroadcastState> {
        return this.server.getState();
    }

    @postConstruct()
    async setState(state: IBroadcastState): Promise<IBroadcastProtocol> {
        await this.server.getState();
        return this.server.setState(state);
    }
}
