// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { serviceIdentifier } from '../types';
import { Connection } from '../connection';
import { Emitter, Event } from '../event';
import { Disposable, DisposableCollection } from '../disposable';

/**
 * Encode and decode messages to perform a connection transformation.
 *
 * _e.g. Encode outgoing objects into buffers and decode incoming buffers back
 * into objects._
 */
export interface MessageTransformer<From, To> {
    /**
     * Called with the received message to transform before emitting it back to readers.
     *
     * _Note that you can filter incoming messages by not calling `emit`._
     */
    decode(message: From, emit: (message: To) => void): void
    /**
     * Called with the message to transform before sending to the underlying connection.
     *
     * _Note that you can filter outgoing messages by not calling `write`._
     */
    encode(message: To, write: (message: From) => void): void
}

export interface TransformableConnection<T> extends Connection<T> {

    addTransform<To>(transformer: MessageTransformer<T, To>): TransformableConnection<To>
}

export const ConnectionTransformer = serviceIdentifier<ConnectionTransformer>('ConnectionTransformerFactory');
export interface ConnectionTransformer {

    transformConnection<From, To>(connection: Connection<From>, transformer: MessageTransformer<From, To>): TransformableConnection<To>;
}

export class DefaultConnectionTransformer implements ConnectionTransformer {

    transformConnection<From, To>(connection: Connection<From>, transformer: MessageTransformer<From, To>): TransformableConnection<To> {
        return new DefaultTransformableConnection(connection).addTransform(transformer);
    }
}

export class DefaultTransformableConnection<T> implements Connection<T> {

    protected transformers?: MessageTransformer<T, any>[] = [];
    protected disposables = new DisposableCollection();
    protected onMessageEmitter = this.disposables.pushThru(new Emitter<any>());

    /**
     * Queue to preserve ordering of decoded messages to be received.
     */
    protected decodeQueue = Promise.resolve();

    /**
     * Queue to preserve ordering of encoded messages to be sent.
     */
    protected encodeQueue = Promise.resolve();

    constructor(
        protected underlyingConnection: Connection<T>
    ) {
        this.underlyingConnection.onMessage(message => this.decodeRecursive(message, decoded => {
            this.decodeQueue = this.decodeQueue.then(() => {
                this.onMessageEmitter.fire(decoded);
            });
        }), undefined, this.disposables);
    }

    get state(): Connection.State {
        return this.underlyingConnection.state;
    }

    get onOpen(): Event<void> {
        return this.underlyingConnection.onOpen;
    }

    get onClose(): Event<void> {
        return this.underlyingConnection.onClose;
    }

    get onError(): Event<Error> {
        return this.underlyingConnection.onError;
    }

    get onMessage(): Event<T> {
        return this.onMessageEmitter.event;
    }

    addTransform<To>(transformer: MessageTransformer<T, To>): TransformableConnection<To> {
        this.transformers!.push(transformer);
        if (Disposable.is(transformer)) {
            this.disposables.push(transformer);
        }
        return this as TransformableConnection<any>;
    }

    sendMessage(message: any): void {
        this.encodeRecursive(message, encoded => {
            this.encodeQueue = this.encodeQueue.then(() => {
                this.underlyingConnection.sendMessage(encoded);
            });
        });
    }

    close(): void {
        this.underlyingConnection.close();
        this.disposables.dispose();
        this.transformers = undefined;
    }

    /**
     * Run the transformers in standard order for encoding.
     */
    protected encodeRecursive(value: any, end: (encoded: any) => void, transformerIndex = this.transformers!.length - 1): void {
        if (transformerIndex === -1) {
            return end(value);
        }
        this.transformers![transformerIndex].encode(value, encoded => this.encodeRecursive(encoded, end, transformerIndex - 1));
    }

    /**
     * Run the transformers in reverse order for decoding.
     */
    protected decodeRecursive(value: any, end: (decoded: any) => void, transformerIndex = 0): void {
        if (transformerIndex === this.transformers!.length) {
            return end(value);
        }
        this.transformers![transformerIndex].decode(value, decoded => this.decodeRecursive(decoded, end, transformerIndex + 1));
    }
}
