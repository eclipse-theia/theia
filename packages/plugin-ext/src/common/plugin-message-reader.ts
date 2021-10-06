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

import { AbstractMessageReader, Disposable } from '@theia/core/shared/vscode-languageserver-protocol';
import { PluginMessage } from './plugin-message';

/**
 * Support for reading string messages through RPC protocol.
 *
 * Buffers events until a listener is registered.
 */
export class PluginMessageReader extends AbstractMessageReader {

    protected state: 'initial' | 'listening' | 'closed' = 'initial';

    protected callback?: (message: PluginMessage) => void;

    /**
     * Buffered events until `.listen` is called. Becomes `undefined` after.
     */
    protected bufferedEvents?: { message?: string, error?: unknown }[] = [];

    listen(callback: (message: PluginMessage) => void): Disposable {
        if (this.state === 'initial') {
            this.state = 'listening';
            this.callback = callback;
            for (const { message, error } of this.bufferedEvents!) {
                if (!this.callback) {
                    break; // We got disposed.
                } else if (message) {
                    this.emitMessage(message);
                } else if (error) {
                    this.fireError(error);
                } else {
                    this.fireClose();
                }
            }
            this.bufferedEvents = undefined;
            return { dispose: () => this.callback = undefined };
        }
        return { dispose: () => { } };
    }

    /**
     * Notify the listener (`this.callback`) that a new message was received.
     *
     * If a listener isn't registered yet we will queue the messages (FIFO).
     */
    readMessage(message: string): void {
        if (this.state === 'initial') {
            this.bufferedEvents!.push({ message });
        } else if (this.state === 'listening') {
            this.emitMessage(message);
        }
    }

    fireError(error: unknown): void {
        if (this.state === 'initial') {
            this.bufferedEvents!.push({ error });
        } else if (this.state === 'listening') {
            super.fireError(error);
        }
    }

    fireClose(): void {
        if (this.state === 'initial') {
            this.bufferedEvents!.push({});
        } else if (this.state === 'listening') {
            super.fireClose();
        }
        this.state = 'closed';
    }

    protected emitMessage(message: string): void {
        const data = JSON.parse(message);
        this.callback!(data);
    }
}
