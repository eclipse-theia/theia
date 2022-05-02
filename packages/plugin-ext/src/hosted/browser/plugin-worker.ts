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
import { injectable } from '@theia/core/shared/inversify';
import { Emitter } from '@theia/core/lib/common/event';
import { RPCProtocol } from '../../common/rpc-protocol';
import { RPCProtocolImpl } from '../../common/rpc-protocol';
import { ArrayBufferReadBuffer, ArrayBufferWriteBuffer } from '@theia/core/lib/common/message-rpc/array-buffer-message-buffer';
import { ChannelCloseEvent, MessageProvider } from '@theia/core/lib/common/message-rpc';

@injectable()
export class PluginWorker {

    private worker: Worker;

    public readonly rpc: RPCProtocol;

    constructor() {
        const emitter = new Emitter<string>();

        this.worker = new Worker(new URL('./worker/worker-main',
            // @ts-expect-error (TS1343)
            // We compile to CommonJS but `import.meta` is still available in the browser
            import.meta.url));

        this.worker.onmessage = m => emitter.fire(m.data);
        this.worker.onerror = e => console.error(e);

        const onCloseEmitter = new Emitter<ChannelCloseEvent>();
        const onMessageEmitter = new Emitter<MessageProvider>();
        const onErrorEmitter = new Emitter<unknown>();

        // eslint-disable-next-line arrow-body-style
        this.worker.onmessage = buffer => onMessageEmitter.fire(() => {
            return new ArrayBufferReadBuffer(buffer.data);
        });

        this.worker.onerror = e => onErrorEmitter.fire(e);
        onErrorEmitter.event(e => console.error(e));

        this.rpc = new RPCProtocolImpl({
            close: () => { },
            getWriteBuffer: () => {
                const writer = new ArrayBufferWriteBuffer();
                writer.onCommit(buffer => {
                    this.worker.postMessage(buffer);
                });
                return writer;
            },
            onClose: onCloseEmitter.event,
            onError: onErrorEmitter.event,
            onMessage: onMessageEmitter.event
        });
    }

}
