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

import { Message, MessageWriter, Emitter, Event } from '@theia/core/shared/vscode-ws-jsonrpc';
import { ConnectionMain, ConnectionExt } from './plugin-api-rpc';

export abstract class AbstractMessageWriter {
    protected errorEmitter = new Emitter<[Error, Message | undefined, number | undefined]>();
    protected closeEmitter = new Emitter<void>();
    dispose(): void {
        this.errorEmitter.dispose();
        this.closeEmitter.dispose();
    }
    get onError(): Event<[Error, Message | undefined, number | undefined]> {
        return this.errorEmitter.event;
    }
    fireError(error: Error, message: Message | undefined, count: number | undefined): void {
        this.errorEmitter.fire([this.asError(error), message, count]);
    }
    get onClose(): Event<void> {
        return this.closeEmitter.event;
    }
    fireClose(): void {
        this.closeEmitter.fire(undefined);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asError(error: any): Error {
        if (error instanceof Error) {
            return error;
        } else {
            return new Error(`Writer received error. Reason: ${typeof error.message === 'string' ? error.message : 'unknown'}`);
        }
    }
}

/**
 * Support for writing string message through RPC protocol.
 */
export class PluginMessageWriter extends AbstractMessageWriter implements MessageWriter {
    constructor(
        protected readonly id: string,
        protected readonly proxy: ConnectionMain | ConnectionExt) {
        super();
    }

    write(message: string): void;
    write(message: Message): void;
    write(arg: string | Message): void {
        const content = JSON.stringify(arg);
        this.proxy.$sendMessage(this.id, content);
    }
}
