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
import { Emitter, Event } from '@theia/core/lib/common';
import { IBroadcastClient, IBroadcastProtocol } from './broadcast-protocol';

@injectable()
export class BroadcastWatcher {

    private readonly emitter: Emitter<IBroadcastProtocol>;

    constructor() {
        this.emitter = new Emitter<IBroadcastProtocol>();
    }

    getConnectedClient(): IBroadcastClient {
        const { emitter } = this;
        return {
            onStateUpdate(event: IBroadcastProtocol) {
                emitter.fire(event);
            }
        };
    }

    get onStateUpdate(): Event<IBroadcastProtocol> {
        return this.emitter.event;
    }
}
