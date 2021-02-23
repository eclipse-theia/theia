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

import { DataCallback, Emitter, Event, PartialMessageInfo } from '@theia/core/shared/vscode-ws-jsonrpc';

export abstract class AbstractMessageReader {
    protected errorEmitter = new Emitter<Error>();
    protected closeEmitter = new Emitter<void>();
    protected partialMessageEmitter = new Emitter<PartialMessageInfo>();
    dispose(): void {
        this.errorEmitter.dispose();
        this.closeEmitter.dispose();
    }
    get onError(): Event<Error> {
        return this.errorEmitter.event;
    }
    fireError(error: Error): void {
        this.errorEmitter.fire(this.asError(error));
    }
    get onClose(): Event<void> {
        return this.closeEmitter.event;
    }
    fireClose(): void {
        this.closeEmitter.fire(undefined);
    }
    get onPartialMessage(): Event<PartialMessageInfo> {
        return this.partialMessageEmitter.event;
    }
    firePartialMessage(info: PartialMessageInfo): void {
        this.partialMessageEmitter.fire(info);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    asError(error: any): Error {
        if (error instanceof Error) {
            return error;
        } else {
            return new Error(`Reader received error. Reason: ${typeof error.message === 'string' ? error.message : 'unknown'}`);
        }
    }
}

/**
 * Support for reading string message through RPC protocol.
 */
export class PluginMessageReader extends AbstractMessageReader {
    protected state: 'initial' | 'listening' | 'closed' = 'initial';
    protected callback: DataCallback | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    protected readonly events: { message?: any, error?: any }[] = [];

    constructor() {
        super();
    }

    listen(callback: DataCallback): void {
        if (this.state === 'initial') {
            this.state = 'listening';
            this.callback = callback;
            while (this.events.length !== 0) {
                const event = this.events.pop()!;
                if (event.message) {
                    this.readMessage(event.message);
                } else if (event.error) {
                    this.fireError(event.error);
                } else {
                    this.fireClose();
                }
            }
        }
    }

    readMessage(message: string): void {
        if (this.state === 'initial') {
            this.events.splice(0, 0, { message });
        } else if (this.state === 'listening') {
            const data = JSON.parse(message);
            this.callback!(data);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fireError(error: any): void {
        if (this.state === 'initial') {
            this.events.splice(0, 0, { error });
        } else if (this.state === 'listening') {
            super.fireError(error);
        }
    }

    fireClose(): void {
        if (this.state === 'initial') {
            this.events.splice(0, 0, {});
        } else if (this.state === 'listening') {
            super.fireClose();
        }
        this.state = 'closed';
    }
}
