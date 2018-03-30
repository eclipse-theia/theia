/*
 * Copyright (C) 2015-2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
import { injectable } from "inversify";
import { RPCProtocolImpl, RPCProtocol } from '../api/rpc-protocol';
import { Emitter } from '@theia/core/lib/common/event';

@injectable()
export class ExtensionWorker {

    private worker: Worker;
    public readonly rpc: RPCProtocol;
    constructor() {
        const emmitter = new Emitter();
        this.worker = new (require('../worker/worker-main'));
        this.worker.onmessage = (message) => {
            emmitter.fire(message.data);
        };

        this.rpc = new RPCProtocolImpl({
            onMessage: emmitter.event,
            send: (m: {}) => this.worker.postMessage(m)
        });

    }
}
