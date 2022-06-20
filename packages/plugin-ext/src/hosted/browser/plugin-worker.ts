// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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

import '@theia/core/shared/reflect-metadata';
import { injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { PluginRpc, DefaultPluginRpc } from '../../common/rpc-protocol';
import { BufferedConnection, Connection, ConnectionState, DeferredConnection, waitForRemote } from '@theia/core/lib/common/connection';
import { TransformedConnection } from '@theia/core/lib/common/connection-transformer';
import { MsgpackMessageTransformer } from '@theia/core/lib/common/msgpack';

@injectable()
export class PluginWorker {

    private worker: Worker;

    public readonly rpc: PluginRpc;

    constructor() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emitter = new Emitter<any>();

        this.worker = new Worker(new URL('./worker/worker-main',
            // @ts-expect-error (TS1343)
            // We compile to CommonJS but `import.meta` is still available in the browser
            import.meta.url));

        this.worker.onmessage = m => emitter.fire(m.data);
        this.worker.onerror = e => console.error(e);

        const connectionToWorker: Connection<unknown[]> = {
            state: ConnectionState.OPENED,
            onClose: () => ({ dispose(): void { } }),
            onError: () => ({ dispose(): void { } }),
            onOpen: () => ({ dispose(): void { } }),
            onMessage: emitter.event,
            sendMessage: message => {
                this.worker.postMessage(message);
            },
            close: () => {
                throw new Error('cannot close this connection');
            }
        };
        const bufferedConnection = new BufferedConnection(connectionToWorker);
        const msgpackConnection = new TransformedConnection(bufferedConnection, MsgpackMessageTransformer);
        const deferredConnection = new DeferredConnection(waitForRemote(msgpackConnection));
        this.rpc = new DefaultPluginRpc(deferredConnection);
    }

}
