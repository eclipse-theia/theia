/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from "inversify";
import { RPCProtocolImpl, RPCProtocol } from '../api/rpc-protocol';
import { Emitter } from '@theia/core/lib/common/event';

@injectable()
export class PluginWorker {

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
