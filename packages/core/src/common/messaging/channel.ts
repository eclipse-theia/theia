// *****************************************************************************
// Copyright (C) 2021 Red Hat, Inc. and others.
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
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Disposable, DisposableCollection } from '../disposable';
import { Emitter, Event } from '../event';

export interface ChannelCloseEvent {
    reason: string,
    code?: number
};

/**
 * A channel is a bidirectional transport channel to send and receive Javascript objects with lifecycle and
 * error signalling.
 */
export interface Channel<T = any> {

    /**
     * The remote side has closed the channel
     */
    onClose: Event<ChannelCloseEvent>;

    /**
     * An error has occurred while writing to or reading from the channel
     */
    onError: Event<unknown>;

    /**
     * A message has arrived and can be read  by listeners.
     */
    onMessage: Event<T>;

    /**
     * Send a message over to the channel.
     */
    send(message: T): void

    /**
     * Close this channel. No {@link onClose} event should be sent
     */
    close(): void;
}

/**
 * Common {@link Channel} base implementation that takes care of setup and proper
 * disposal of the event emitters.
 */
export abstract class AbstractChannel<T = any> implements Channel<T>, Disposable {

    protected toDispose = new DisposableCollection();

    protected onCloseEmitter = new Emitter<ChannelCloseEvent>();
    get onClose(): Event<ChannelCloseEvent> {
        return this.onCloseEmitter.event;
    }

    protected onErrorEmitter = new Emitter<unknown>();
    get onError(): Event<unknown> {
        return this.onErrorEmitter.event;
    }

    protected onMessageEmitter = new Emitter<T>();
    get onMessage(): Event<T> {
        return this.onMessageEmitter.event;
    }

    constructor() {
        this.toDispose.pushAll([
            this.onCloseEmitter,
            this.onErrorEmitter,
            this.onMessageEmitter,
            Disposable.create(() => this.close())
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    close(): void {
        this.dispose();
    }

    abstract send(message: T): void;

}
