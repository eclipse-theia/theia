/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { Disposable, DisposableCollection } from '../disposable';
import { Emitter } from '../event';
import { Channel } from './channel';

export class WebSocketChannel implements Channel<string> {

    static wsPath = '/services';

    fireError: (reason: any) => void = () => { };

    protected readonly closeEmitter = new Emitter<[number, string]>();
    protected readonly toDispose = new DisposableCollection(this.closeEmitter);
    protected fireOpen: () => void = () => { };
    protected fireMessage: (data: any) => void = () => { };
    protected closing = false;

    constructor(
        readonly id: number,
        protected readonly doSend: (content: string) => void
    ) { }

    dispose(): void {
        this.toDispose.dispose();
    }

    handleMessage(message: WebSocketChannel.Message): void {
        if (message.kind === 'ready') {
            this.fireOpen();
        } else if (message.kind === 'data') {
            this.fireMessage(message.content);
        } else if (message.kind === 'close') {
            this.fireClose(message.code, message.reason);
        }
    }

    open(path: string): void {
        this.checkNotDisposed();
        this.doSend(JSON.stringify(<WebSocketChannel.OpenMessage>{
            kind: 'open',
            id: this.id,
            path
        }));
    }

    ready(): void {
        this.checkNotDisposed();
        this.doSend(JSON.stringify(<WebSocketChannel.ReadyMessage>{
            kind: 'ready',
            id: this.id
        }));
    }

    send(content: string): void {
        this.checkNotDisposed();
        this.doSend(JSON.stringify(<WebSocketChannel.DataMessage>{
            kind: 'data',
            id: this.id,
            content
        }));
    }

    close(code: number = 1000, reason: string = ''): void {
        if (this.closing) {
            // Do not try to close the channel if it is already closing.
            return;
        }
        this.checkNotDisposed();
        this.doSend(JSON.stringify(<WebSocketChannel.CloseMessage>{
            kind: 'close',
            id: this.id,
            code,
            reason
        }));
        this.fireClose(code, reason);
    }

    tryClose(code: number = 1000, reason: string = ''): void {
        if (this.closing || this.toDispose.disposed) {
            // Do not try to close the channel if it is already closing or disposed.
            return;
        }
        this.doSend(JSON.stringify(<WebSocketChannel.CloseMessage>{
            kind: 'close',
            id: this.id,
            code,
            reason
        }));
        this.fireClose(code, reason);
    }

    onOpen(cb: () => void): void {
        this.checkNotDisposed();
        this.fireOpen = cb;
        this.toDispose.push(Disposable.create(() => this.fireOpen = () => { }));
    }

    onMessage(cb: (data: any) => void): void {
        this.checkNotDisposed();
        this.fireMessage = cb;
        this.toDispose.push(Disposable.create(() => this.fireMessage = () => { }));
    }

    onError(cb: (reason: any) => void): void {
        this.checkNotDisposed();
        this.fireError = cb;
        this.toDispose.push(Disposable.create(() => this.fireError = () => { }));
    }

    onClose(cb: (code: number, reason: string) => void): Disposable {
        this.checkNotDisposed();
        return this.closeEmitter.event(([code, reason]) => cb(code, reason));
    }

    protected fireClose(code: number, reason: string): void {
        if (this.closing) {
            return;
        }
        this.closing = true;
        try {
            this.closeEmitter.fire([code, reason]);
        } finally {
            this.closing = false;
        }
        this.dispose();
    }

    protected checkNotDisposed(): void {
        if (this.toDispose.disposed) {
            throw new Error('The channel has been disposed.');
        }
    }

}
export namespace WebSocketChannel {
    export interface OpenMessage {
        kind: 'open'
        id: number
        path: string
    }
    export interface ReadyMessage {
        kind: 'ready'
        id: number
    }
    export interface DataMessage {
        kind: 'data'
        id: number
        content: string
    }
    export interface CloseMessage {
        kind: 'close'
        id: number
        code: number
        reason: string
    }
    export type Message = OpenMessage | ReadyMessage | DataMessage | CloseMessage;
}
