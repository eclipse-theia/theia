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

import { MessageReader, MessageWriter, Message } from 'vscode-languageserver-protocol';
import { Disposable, DisposableCollection } from '../../common';

/**
 * Abstraction that can be used to route JSON-RPC messages around.
 *
 * This is close to `vscode_jsonrpc.MessageConnection` but without all the JSON-RPC
 * specific methods such as `sendRequest`, `sendNotification`, etc.
 */
export interface RpcMessageRelay extends Disposable {
    readonly reader: MessageReader;
    readonly writer: MessageWriter;
    forward(to: RpcMessageRelay, map?: (message: Message) => Message): void;
    onClose(callback: () => void): Disposable;
}

export namespace RpcMessageRelay {
    export function create(reader: MessageReader, writer: MessageWriter, onDispose: () => void): RpcMessageRelay {
        const disposeOnClose = new DisposableCollection();
        reader.onClose(() => disposeOnClose.dispose());
        writer.onClose(() => disposeOnClose.dispose());
        return {
            reader,
            writer,
            forward(to: RpcMessageRelay, map?: (message: Message) => Message): void {
                reader.listen(data => {
                    if (map) {
                        data = map(data);
                    }
                    to.writer.write(data);
                });
            },
            onClose(callback: () => void): Disposable {
                return disposeOnClose.push(Disposable.create(callback));
            },
            dispose(): void {
                onDispose();
            }
        };
    }
}
