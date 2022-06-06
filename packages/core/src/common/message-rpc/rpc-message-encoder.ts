// *****************************************************************************
// Copyright (C) 2022 Red Hat, Inc. and others.
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

import { ReadBuffer, WriteBuffer } from './message-buffer';

/**
 * This code lets you encode rpc protocol messages (request/reply/notification/error/cancel)
 * into a channel write buffer and decode the same messages from a read buffer.
 * Custom encoders/decoders can be registered to specially handling certain types of values
 * to be encoded. Clients are responsible for ensuring that the set of tags for encoders
 * is distinct and the same at both ends of a channel.
 */

export type RpcMessage = RequestMessage | ReplyMessage | ReplyErrMessage | CancelMessage | NotificationMessage;

export const enum RpcMessageType {
    Request = 1,
    Notification = 2,
    Reply = 3,
    ReplyErr = 4,
    Cancel = 5,
}

export interface CancelMessage {
    type: RpcMessageType.Cancel;
    id: number;
}

export interface RequestMessage {
    type: RpcMessageType.Request;
    id: number;
    method: string;
    args: any[];
}

export interface NotificationMessage {
    type: RpcMessageType.Notification;
    id: number;
    method: string;
    args: any[];
}

export interface ReplyMessage {
    type: RpcMessageType.Reply;
    id: number;
    res: any;
}

export interface ReplyErrMessage {
    type: RpcMessageType.ReplyErr;
    id: number;
    err: any;
}

export interface SerializedError {
    readonly $isError: true;
    readonly name: string;
    readonly message: string;
    readonly stack: string;
}

/**
 * A special error that can be returned in case a request
 * has failed. Provides additional information i.e. an error code
 * and additional error data.
 */
export class ResponseError extends Error {
    constructor(readonly code: number, message: string, readonly data: any) {
        super(message);
    }
}

/**
 * The tag values for the default {@link ValueEncoder}s & {@link ValueDecoder}s
 */

export enum ObjectType {
    JSON = 0,
    ByteArray = 1,
    ObjectArray = 2,
    Undefined = 3,
    Object = 4,
    String = 5,
    Boolean = 6,
    Number = 7,
    // eslint-disable-next-line @typescript-eslint/no-shadow
    ResponseError = 8,
    Error = 9

}

/**
 * A value encoder writes javascript values to a write buffer. Encoders will be asked
 * in turn (ordered by their tag value, descending) whether they can encode a given value
 * This means encoders with higher tag values have priority. Since the default encoders
 * have tag values from 1-7, they can be easily overridden.
 */
export interface ValueEncoder {
    /**
     * Returns true if this encoder wants to encode this value.
     * @param value the value to be encoded
     */
    is(value: any): boolean;
    /**
     * Write the given value to the buffer. Will only be called if {@link is(value)} returns true.
     * @param buf The buffer to write to
     * @param value The value to be written
     * @param recursiveEncode A function that will use the encoders registered on the {@link MessageEncoder}
     * to write a value to the underlying buffer. This is used mostly to write structures like an array
     * without having to know how to encode the values in the array
     */
    write(buf: WriteBuffer, value: any, recursiveEncode?: (buf: WriteBuffer, value: any) => void): void;
}

/**
 * Reads javascript values from a read buffer
 */
export interface ValueDecoder {
    /**
     * Reads a value from a read buffer. This method will be called for the decoder that is
     * registered for the tag associated with the value encoder that encoded this value.
     * @param buf The read buffer to read from
     * @param recursiveDecode A function that will use the decoders registered on the {@link RpcMessageDecoder}
     * to read values from the underlying read buffer. This is used mostly to decode structures like an array
     * without having to know how to decode the values in the array.
     */
    read(buf: ReadBuffer, recursiveDecode: (buf: ReadBuffer) => unknown): unknown;
}

/**
 * A `RpcMessageDecoder` parses a a binary message received via {@link ReadBuffer} into a {@link RpcMessage}
 */
export class RpcMessageDecoder {

    protected decoders: Map<number, ValueDecoder> = new Map();

    constructor() {
        this.registerDecoders();
    }

    protected registerDecoders(): void {
        this.registerDecoder(ObjectType.JSON, {
            read: buf => {
                const json = buf.readString();
                return JSON.parse(json);
            }
        });
        this.registerDecoder(ObjectType.Error, {
            read: buf => {
                const serializedError: SerializedError = JSON.parse(buf.readString());
                const error = new Error(serializedError.message);
                Object.assign(error, serializedError);
                return error;
            }
        });

        this.registerDecoder(ObjectType.ResponseError, {
            read: buf => {
                const error = JSON.parse(buf.readString());
                return new ResponseError(error.code, error.message, error.data);
            }
        });
        this.registerDecoder(ObjectType.ByteArray, {
            read: buf => buf.readBytes()
        });

        this.registerDecoder(ObjectType.ObjectArray, {
            read: buf => this.readArray(buf)
        });

        this.registerDecoder(ObjectType.Undefined, {
            read: () => undefined
        });

        this.registerDecoder(ObjectType.Object, {
            read: (buf, recursiveRead) => {
                const propertyCount = buf.readLength();
                const result = Object.create({});
                for (let i = 0; i < propertyCount; i++) {
                    const key = buf.readString();
                    const value = recursiveRead(buf);
                    result[key] = value;
                }
                return result;
            }
        });

        this.registerDecoder(ObjectType.String, {
            read: (buf, recursiveRead) => buf.readString()
        });

        this.registerDecoder(ObjectType.Boolean, {
            read: buf => buf.readUint8() === 1
        });

        this.registerDecoder(ObjectType.Number, {
            read: buf => buf.readNumber()
        });
    }

    /**
     * Registers a new {@link ValueDecoder} for the given tag.
     * After the successful registration the {@link tagIntType} is recomputed
     * by retrieving the highest tag value and calculating the required Uint size to store it.
     * @param tag the tag for which the decoder should be registered.
     * @param decoder the decoder that should be registered.
     * @param overwrite flag to indicate wether an existing registration with the same tag should be overwritten with the new registration.
     */
    registerDecoder(tag: number, decoder: ValueDecoder, overwrite = false): void {
        if (!overwrite && this.decoders.has(tag)) {
            throw new Error(`Decoder already registered: ${tag}`);
        }
        this.decoders.set(tag, decoder);
    }
    parse(buf: ReadBuffer): RpcMessage {
        try {
            const msgType = buf.readUint8();

            switch (msgType) {
                case RpcMessageType.Request:
                    return this.parseRequest(buf);
                case RpcMessageType.Notification:
                    return this.parseNotification(buf);
                case RpcMessageType.Reply:
                    return this.parseReply(buf);
                case RpcMessageType.ReplyErr:
                    return this.parseReplyErr(buf);
                case RpcMessageType.Cancel:
                    return this.parseCancel(buf);
            }
            throw new Error(`Unknown message type: ${msgType}`);
        } catch (e) {
            // exception does not show problematic content: log it!
            console.log('failed to parse message: ' + buf);
            throw e;
        }
    }

    protected parseCancel(msg: ReadBuffer): CancelMessage {
        const callId = msg.readUint32();
        return {
            type: RpcMessageType.Cancel,
            id: callId
        };
    }

    protected parseRequest(msg: ReadBuffer): RequestMessage {
        const callId = msg.readUint32();
        const method = msg.readString();
        let args = this.readArray(msg);
        // convert `null` to `undefined`, since we don't use `null` in internal plugin APIs
        args = args.map(arg => arg === null ? undefined : arg); // eslint-disable-line no-null/no-null

        return {
            type: RpcMessageType.Request,
            id: callId,
            method: method,
            args: args
        };
    }

    protected parseNotification(msg: ReadBuffer): NotificationMessage {
        const callId = msg.readUint32();
        const method = msg.readString();
        let args = this.readArray(msg);
        // convert `null` to `undefined`, since we don't use `null` in internal plugin APIs
        args = args.map(arg => arg === null ? undefined : arg); // eslint-disable-line no-null/no-null

        return {
            type: RpcMessageType.Notification,
            id: callId,
            method: method,
            args: args
        };
    }

    parseReply(msg: ReadBuffer): ReplyMessage {
        const callId = msg.readUint32();
        const value = this.readTypedValue(msg);
        return {
            type: RpcMessageType.Reply,
            id: callId,
            res: value
        };
    }

    parseReplyErr(msg: ReadBuffer): ReplyErrMessage {
        const callId = msg.readUint32();

        const err = this.readTypedValue(msg);

        return {
            type: RpcMessageType.ReplyErr,
            id: callId,
            err
        };
    }

    readArray(buf: ReadBuffer): any[] {
        const length = buf.readLength();
        const result = new Array(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readTypedValue(buf);
        }
        return result;
    }

    readTypedValue(buf: ReadBuffer): any {
        const type = buf.readUint8();
        const decoder = this.decoders.get(type);
        if (!decoder) {
            throw new Error(`No decoder for tag ${type}`);
        }
        return decoder.read(buf, innerBuffer => this.readTypedValue(innerBuffer));
    }
}

/**
 * A `RpcMessageEncoder` writes {@link RpcMessage} objects to a {@link WriteBuffer}. Note that it is
 * up to clients to commit the message. This allows for multiple messages being
 * encoded before sending.
 */
export class RpcMessageEncoder {

    protected readonly encoders: [number, ValueEncoder][] = [];
    protected readonly registeredTags: Set<number> = new Set();

    constructor() {
        this.registerEncoders();
    }

    protected registerEncoders(): void {
        // encoders will be consulted in reverse order of registration, so the JSON fallback needs to be last
        this.registerEncoder(ObjectType.JSON, {
            is: () => true,
            write: (buf, value) => {
                buf.writeString(JSON.stringify(value));
            }
        });

        this.registerEncoder(ObjectType.Object, {
            is: value => typeof value === 'object',
            write: (buf, object, recursiveEncode) => {
                const properties = Object.keys(object);
                const relevant = [];
                for (const property of properties) {
                    const value = object[property];
                    if (typeof value !== 'function') {
                        relevant.push([property, value]);
                    }
                }

                buf.writeLength(relevant.length);
                for (const [property, value] of relevant) {
                    buf.writeString(property);
                    recursiveEncode?.(buf, value);
                }
            }
        });

        this.registerEncoder(ObjectType.Error, {
            is: value => value instanceof Error,
            write: (buf, error: Error) => {
                const { name, message } = error;
                const stack: string = (<any>error).stacktrace || error.stack;
                const serializedError = {
                    $isError: true,
                    name,
                    message,
                    stack
                };
                buf.writeString(JSON.stringify(serializedError));
            }
        });

        this.registerEncoder(ObjectType.ResponseError, {
            is: value => value instanceof ResponseError,
            write: (buf, value) => buf.writeString(JSON.stringify(value))
        });

        this.registerEncoder(ObjectType.Undefined, {
            // eslint-disable-next-line no-null/no-null
            is: value => value == null,
            write: () => { }
        });

        this.registerEncoder(ObjectType.ObjectArray, {
            is: value => Array.isArray(value),
            write: (buf, value) => {
                this.writeArray(buf, value);
            }
        });

        this.registerEncoder(ObjectType.ByteArray, {
            is: value => value instanceof Uint8Array,
            write: (buf, value) => {
                buf.writeBytes(value);
            }
        });

        this.registerEncoder(ObjectType.String, {
            is: value => typeof value === 'string',
            write: (buf, value) => {
                buf.writeString(value);
            }
        });

        this.registerEncoder(ObjectType.Boolean, {
            is: value => typeof value === 'boolean',
            write: (buf, value) => {
                buf.writeUint8(value === true ? 1 : 0);
            }
        });

        this.registerEncoder(ObjectType.Number, {
            is: value => typeof value === 'number',
            write: (buf, value) => {
                buf.writeNumber(value);
            }
        });
    }

    /**
     * Registers a new {@link ValueEncoder} for the given tag.
     * After the successful registration the {@link tagIntType} is recomputed
     * by retrieving the highest tag value and calculating the required Uint size to store it.
     * @param tag the tag for which the encoder should be registered.
     * @param encoder the encoder that should be registered.
     * @param overwrite to indicate wether an existing registration with the same tag should be overwritten with the new registration.
     */
    registerEncoder<T>(tag: number, encoder: ValueEncoder, overwrite = false): void {
        if (!overwrite && this.registeredTags.has(tag)) {
            throw new Error(`Tag already registered: ${tag}`);
        }
        if (!overwrite) {
            this.registeredTags.add(tag);
            this.encoders.push([tag, encoder]);
        } else {
            const overrideIndex = this.encoders.findIndex(existingEncoder => existingEncoder[0] === tag);
            this.encoders[overrideIndex] = [tag, encoder];
        }
    }

    cancel(buf: WriteBuffer, requestId: number): void {
        buf.writeUint8(RpcMessageType.Cancel);
        buf.writeUint32(requestId);
    }

    notification(buf: WriteBuffer, requestId: number, method: string, args: any[]): void {
        buf.writeUint8(RpcMessageType.Notification);
        buf.writeUint32(requestId);
        buf.writeString(method);
        this.writeArray(buf, args);
    }

    request(buf: WriteBuffer, requestId: number, method: string, args: any[]): void {
        buf.writeUint8(RpcMessageType.Request);
        buf.writeUint32(requestId);
        buf.writeString(method);
        this.writeArray(buf, args);
    }

    replyOK(buf: WriteBuffer, requestId: number, res: any): void {
        buf.writeUint8(RpcMessageType.Reply);
        buf.writeUint32(requestId);
        this.writeTypedValue(buf, res);
    }

    replyErr(buf: WriteBuffer, requestId: number, err: any): void {
        buf.writeUint8(RpcMessageType.ReplyErr);
        buf.writeUint32(requestId);
        this.writeTypedValue(buf, err);
    }

    writeTypedValue(buf: WriteBuffer, value: any): void {
        for (let i: number = this.encoders.length - 1; i >= 0; i--) {
            if (this.encoders[i][1].is(value)) {
                buf.writeUint8(this.encoders[i][0]);
                this.encoders[i][1].write(buf, value, (innerBuffer, innerValue) => {
                    this.writeTypedValue(innerBuffer, innerValue);
                });
                return;
            }
        }
    }

    writeArray(buf: WriteBuffer, value: any[]): void {
        buf.writeLength(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeTypedValue(buf, value[i]);
        }
    }
}
