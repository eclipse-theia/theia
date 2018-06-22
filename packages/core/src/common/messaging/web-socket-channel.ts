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

// tslint:disable:no-any

import { IWebSocket } from "vscode-ws-jsonrpc/lib/socket/socket";
import { Disposable, DisposableCollection } from "../disposable";

export class WebSocketChannel implements IWebSocket {

    static wsPath = '/services';

    protected readonly toDispose = new DisposableCollection();

    constructor(
        readonly id: number,
        protected readonly doSend: (content: string) => void
    ) {
        this.toDispose.push(Disposable.NULL);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected checkNotDisposed(): void {
        if (this.toDispose.disposed) {
            throw new Error('The channel has been disposed.');
        }
    }

    handleMessage(message: WebSocketChannel.Message) {
        if (message.kind === 'ready') {
            this.fireOpen();
        } else if (message.kind === 'data') {
            this.fireMessage(message.content);
        } else if (message.kind === 'close') {
            this.fireClose(1000, '');
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

    close(): void {
        this.checkNotDisposed();
        this.doSend(JSON.stringify(<WebSocketChannel.CloseMessage>{
            kind: 'close',
            id: this.id
        }));
    }

    protected fireOpen: () => void = () => { };
    onOpen(cb: () => void): void {
        this.checkNotDisposed();
        this.fireOpen = cb;
        this.toDispose.push(Disposable.create(() => this.fireOpen = () => { }));
    }

    protected fireMessage: (data: any) => void = () => { };
    onMessage(cb: (data: any) => void): void {
        this.checkNotDisposed();
        this.fireMessage = cb;
        this.toDispose.push(Disposable.create(() => this.fireMessage = () => { }));
    }

    fireError: (reason: any) => void = () => { };
    onError(cb: (reason: any) => void): void {
        this.checkNotDisposed();
        this.fireError = cb;
        this.toDispose.push(Disposable.create(() => this.fireError = () => { }));
    }

    fireClose: (code: number, reason: string) => void = () => { };
    onClose(cb: (code: number, reason: string) => void): void {
        this.checkNotDisposed();
        this.fireClose = cb;
        this.toDispose.push(Disposable.create(() => this.fireClose = () => { }));
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
    }
    export type Message = OpenMessage | ReadyMessage | DataMessage | CloseMessage;
}
