/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { Disposable } from './disposable-util';
import { PluginMessageReader } from './plugin-message-reader';
import { PluginMessageWriter } from './plugin-message-writer';
import { MessageReader, MessageWriter, Message } from '@theia/core/shared/vscode-ws-jsonrpc';
import { IWebSocket } from '@theia/core/shared/vscode-ws-jsonrpc';

/**
 * The interface for describing the connection between plugins and main side.
 */
export interface Connection extends Disposable {
    readonly reader: MessageReader;
    readonly writer: MessageWriter;
    /**
     * Allows to forward messages to another connection.
     *
     * @param to the connection to forward messages
     * @param map the function in which the message can be changed before forwarding
     */
    forward(to: Connection, map?: (message: Message) => Message): void;
}

/**
 * The container for message reader and writer which can be used to create connection between plugins and main side.
 */
export class PluginConnection implements Connection {
    constructor(
        readonly reader: PluginMessageReader,
        readonly writer: PluginMessageWriter,
        readonly dispose: () => void) {
    }

    forward(to: Connection, map: (message: Message) => Message = message => message): void {
        this.reader.listen(input => {
            const output = map(input);
            to.writer.write(output);
        });
    }
}

/**
 * [IWebSocket](#IWebSocket) implementation over RPC.
 */
export class PluginWebSocketChannel implements IWebSocket {
    constructor(protected readonly connection: PluginConnection) { }

    send(content: string): void {
        this.connection.writer.write(content);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onMessage(cb: (data: any) => void): void {
        this.connection.reader.listen(cb);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onError(cb: (reason: any) => void): void {
        this.connection.reader.onError(e => cb(e));
    }

    onClose(cb: (code: number, reason: string) => void): void {
        this.connection.reader.onClose(() => cb(-1, 'closed'));
    }

    dispose(): void {
        this.connection.dispose();
    }
}
