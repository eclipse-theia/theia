// *****************************************************************************
// Copyright (C) 2022 STMicroelectronics and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Duplex } from 'stream';
import { Disposable, Emitter, Event } from '../../common';
import { Uint8ArrayReadBuffer, Uint8ArrayWriteBuffer } from '../../common/message-rpc/uint8-array-message-buffer';

/**
 * A `BinaryMessagePipe` is capable of sending and retrieving binary messages i.e. {@link Uint8Array}s over
 * and underlying streamed process pipe/fd. The message length of individual messages is encoding at the beginning of
 * a new message. This makes it possible to extract messages from the streamed data.
 */
export class BinaryMessagePipe implements Disposable {
    static readonly MESSAGE_START_IDENTIFIER = '<MessageStart>';
    protected dataHandler = (chunk: Uint8Array) => this.handleChunk(chunk);

    protected onMessageEmitter = new Emitter<Uint8Array>();
    protected cachedMessageData: StreamedMessageData = {
        chunks: [],
        missingBytes: 0
    };

    get onMessage(): Event<Uint8Array> {
        return this.onMessageEmitter.event;
    }

    constructor(protected readonly underlyingPipe: Duplex) {
        underlyingPipe.on('data', this.dataHandler);
    }

    send(message: Uint8Array): void {
        this.underlyingPipe.write(this.encodeMessageStart(message));
        this.underlyingPipe.write(message);
    }

    protected handleChunk(chunk: Uint8Array): void {
        if (this.cachedMessageData.missingBytes === 0) {
            // There is no currently streamed message => We expect that the beginning of the chunk is the message start for a new message
            this.handleNewMessage(chunk);
        } else {
            // The chunk contains message data intended for the currently cached message
            this.handleMessageContentChunk(chunk);
        }
    }

    protected handleNewMessage(chunk: Uint8Array): void {
        if (chunk.byteLength < this.messageStartByteLength) {
            // The chunk only contains a part of the encoded message start
            this.cachedMessageData.partialMessageStart = chunk;
            return;
        }

        const messageLength = this.readMessageStart(chunk);

        if (chunk.length - this.messageStartByteLength > messageLength) {
            // The initial chunk contains more than one binary message => Fire `onMessage` for first message and handle remaining content
            const firstMessage = chunk.slice(this.messageStartByteLength, this.messageStartByteLength + messageLength);
            this.onMessageEmitter.fire(firstMessage);
            this.handleNewMessage(chunk.slice(this.messageStartByteLength + messageLength));

        } else if (chunk.length - this.messageStartByteLength === messageLength) {
            // The initial chunk contains exactly one complete message. => Directly fire the `onMessage` event.
            this.onMessageEmitter.fire(chunk.slice(this.messageStartByteLength));
        } else {
            // The initial chunk contains only part of the message content => Cache message data
            this.cachedMessageData.chunks = [chunk.slice(this.messageStartByteLength)];
            this.cachedMessageData.missingBytes = messageLength - chunk.byteLength + this.messageStartByteLength;
        }
    }

    protected handleMessageContentChunk(chunk: Uint8Array): void {
        if (this.cachedMessageData) {
            if (chunk.byteLength < this.cachedMessageData.missingBytes) {
                // The chunk only contains parts of the missing bytes for the cached message.
                this.cachedMessageData.chunks.push(chunk);
                this.cachedMessageData.missingBytes -= chunk.byteLength;
            } else if (chunk.byteLength === this.cachedMessageData.missingBytes) {
                // Chunk contains exactly the missing data for the cached message
                this.cachedMessageData.chunks.push(chunk);
                this.emitCachedMessage();
            } else {
                // Chunk contains missing data for the cached message + data for the next message
                const messageEnd = this.cachedMessageData.missingBytes;
                const missingData = chunk.slice(0, messageEnd);
                this.cachedMessageData.chunks.push(missingData);
                this.emitCachedMessage();
                this.handleNewMessage(chunk.slice(messageEnd));
            }

        }
    }

    protected emitCachedMessage(): void {
        const message = Buffer.concat(this.cachedMessageData.chunks);
        this.onMessageEmitter.fire(message);
        this.cachedMessageData.chunks = [];
        this.cachedMessageData.missingBytes = 0;
    }

    /**
     * Encodes the start of a new message into a {@link Uint8Array}.
     * The message start consists of a identifier string and the length of the following message.
     * @returns the buffer contains the encoded message start
     */
    protected encodeMessageStart(message: Uint8Array): Uint8Array {
        const writer = new Uint8ArrayWriteBuffer()
            .writeString(BinaryMessagePipe.MESSAGE_START_IDENTIFIER)
            .writeUint32(message.length);
        const messageStart = writer.getCurrentContents();
        writer.dispose();
        return messageStart;
    }

    protected get messageStartByteLength(): number {
        // 4 bytes for length of id + id string length + 4 bytes for length of message
        return 4 + BinaryMessagePipe.MESSAGE_START_IDENTIFIER.length + 4;
    }

    /**
     * Reads the start of a new message from a stream chunk (or cached message) received from the underlying pipe.
     * The message start is expected to consist of an identifier string and the length of the message.
     * @param chunk The stream chunk.
     * @returns The length of the message content to read.
     * @throws An error if the message start can not be read successfully.
     */
    protected readMessageStart(chunk: Uint8Array): number {
        const messageData = this.cachedMessageData.partialMessageStart ? Buffer.concat([this.cachedMessageData.partialMessageStart, chunk]) : chunk;
        this.cachedMessageData.partialMessageStart = undefined;

        const reader = new Uint8ArrayReadBuffer(messageData);
        const identifier = reader.readString();

        if (identifier !== BinaryMessagePipe.MESSAGE_START_IDENTIFIER) {
            throw new Error(`Could not read message start. The start identifier should be '${BinaryMessagePipe.MESSAGE_START_IDENTIFIER}' but was '${identifier}`);
        }
        const length = reader.readUint32();
        return length;
    }

    dispose(): void {
        this.underlyingPipe.removeListener('data', this.dataHandler);
        this.underlyingPipe.end();
        this.onMessageEmitter.dispose();
        this.cachedMessageData = {
            chunks: [],
            missingBytes: 0
        };
    }
}

interface StreamedMessageData {
    chunks: Uint8Array[];
    missingBytes: number;
    partialMessageStart?: Uint8Array;
}
