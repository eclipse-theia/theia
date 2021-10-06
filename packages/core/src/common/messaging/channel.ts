/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as rpc from 'vscode-languageserver-protocol';
import { RpcMessageRelay } from './rpc-message-relay';
import { Disposable } from '../disposable';

/**
 * A `Channel` represents a bidirectional logical connection to a remote.
 */
export interface Channel<T = unknown> extends Disposable {
    send(content: T): void;
    onMessage(cb: (data: T) => void): void;
    onError(cb: (reason: any) => void): void;
    onClose(cb: (code: number, reason: string) => void): void;
}

export namespace Channel {

    export class MessageReader extends rpc.AbstractMessageReader implements rpc.MessageReader {
        constructor(protected channel: Channel<string>) {
            super();
            channel.onError(error => this.fireError(error));
            channel.onClose(() => this.fireClose());
        }
        listen(callback: rpc.DataCallback): rpc.Disposable {
            this.channel.onMessage(data => callback(JSON.parse(data)));
            return rpc.Disposable.create(() => {
                throw new Error('not supported');
            });
        }
    }

    export class MessageWriter extends rpc.AbstractMessageWriter implements rpc.MessageWriter {
        constructor(protected channel: Channel<string>) {
            super();
            channel.onError(error => this.fireError(error));
            channel.onClose(() => this.fireClose());
        }
        async write(message: rpc.Message): Promise<void> {
            this.channel.send(JSON.stringify(message));
        }
        end(): void { }
    }

    export function createMessageConnection(channel: Channel<string>, logger?: rpc.Logger, options?: rpc.ConnectionOptions): rpc.MessageConnection {
        const reader = new MessageReader(channel);
        const writer = new MessageWriter(channel);
        return rpc.createMessageConnection(reader, writer, logger, options);
    }

    export function createRpcMessageRelay(channel: Channel<string>, onDispose: () => void = () => { }): RpcMessageRelay {
        const reader = new MessageReader(channel);
        const writer = new MessageWriter(channel);
        return RpcMessageRelay.create(reader, writer, onDispose);
    }
}
