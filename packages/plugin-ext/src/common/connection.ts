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
import { MessageReader, MessageWriter, Message } from 'vscode-jsonrpc';

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
    reader: PluginMessageReader;
    writer: PluginMessageWriter;
    clearConnection: () => void;

    constructor(protected readonly pluginMessageReader: PluginMessageReader,
        protected readonly pluginMessageWriter: PluginMessageWriter,
        dispose: () => void) {
        this.reader = pluginMessageReader;
        this.writer = pluginMessageWriter;
        this.clearConnection = dispose;
    }

    forward(to: Connection, map: (message: Message) => Message = message => message): void {
        this.reader.listen(input => {
            const output = map(input);
            to.writer.write(output);
        });
    }

    /**
     * Has to be called when the connection was closed.
     */
    dispose(): void {
        this.clearConnection();
    }
}
