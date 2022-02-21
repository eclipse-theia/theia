/********************************************************************************
 * Copyright (C) 2021 Red Hat, Inc. and others.
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
import { ReadBuffer, WriteBuffer } from './message-buffer';

/**
 * This code lets you encode rpc protocol messages (request/reply/notification/error/cancel)
 * into a channel write buffer and decode the same messages from a read buffer.
 * Custom encoders/decoders can be registered to specially handling certain types of values
 * to be encoded. Clients are responsible for ensuring that the set of tags for encoders
 * is distinct and the same at both ends of a channel.
 */

export interface SerializedError {
    readonly $isError: true;
    readonly name: string;
    readonly message: string;
    readonly stack: string;
}

export const enum MessageType {
    Request = 1,
    Notification = 2,
    Reply = 3,
    ReplyErr = 4,
    Cancel = 5,
}

export interface CancelMessage {
    type: MessageType.Cancel;
    id: number;
}

export interface RequestMessage {
    type: MessageType.Request;
    id: number;
    method: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any[];
}

export interface NotificationMessage {
    type: MessageType.Notification;
    id: number;
    method: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args: any[];
}

export interface ReplyMessage {
    type: MessageType.Reply;
    id: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res: any;
}

export interface ReplyErrMessage {
    type: MessageType.ReplyErr;
    id: number;
    err: SerializedError;
}

export type RPCMessage = RequestMessage | ReplyMessage | ReplyErrMessage | CancelMessage | NotificationMessage;

enum ObjectType {
    JSON = 0,
    ByteArray = 1,
    ObjectArray = 2,
    Undefined = 3,
    Object = 4
}
/**
 * A value encoder writes javascript values to a write buffer. Encoders will be asked
 * in turn (ordered by their tag value, descending) whether they can encode a given value
 * This means encoders with higher tag values have priority. Since the default encoders
 * have tag values from 0-4, they can be easily overridden.
 */
export interface ValueEncoder {
    /**
     * Returns true if this encoder wants to encode this value.
     * @param value the value to be encoded
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    is(value: any): boolean;
    /**
     * Write the given value to the buffer. Will only be called if {@link is(value)} returns true.
     * @param buf The buffer to write to
     * @param value The value to be written
     * @param recursiveEncode A function that will use the encoders registered on the {@link MessageEncoder}
     * to write a value to the underlying buffer. This is used mostly to write structures like an array
     * without having to know how to encode the values in the array
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    write(buf: WriteBuffer, value: any, recursiveEncode: (buf: WriteBuffer, value: any) => void): void;
}

/**
 * Reads javascript values from a read buffer
 */
export interface ValueDecoder {
    /**
     * Reads a value from a read buffer. This method will be called for the decoder that is
     * registered for the tag associated with the value encoder that encoded this value.
     * @param buf The read buffer to read from
     * @param recursiveDecode A function that will use the decoders registered on the {@link MessageEncoder}
     * to read values from the underlying read buffer. This is used mostly to decode structures like an array
     * without having to know how to decode the values in the aray.
     */
    read(buf: ReadBuffer, recursiveDecode: (buf: ReadBuffer) => unknown): unknown;
}

/**
 * A MessageDecoder parses a ReadBuffer into a RCPMessage
 */

export class MessageDecoder {
    protected decoders: Map<number, ValueDecoder> = new Map();

    constructor() {
        this.registerDecoder(ObjectType.JSON, {
            read: buf => {
                const json = buf.readString();
                return JSON.parse(json);
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
                const propertyCount = buf.readInt();
                const result = Object.create({});
                for (let i = 0; i < propertyCount; i++) {
                    const key = buf.readString();
                    const value = recursiveRead(buf);
                    result[key] = value;
                }
                return result;
            }
        });
    }

    registerDecoder(tag: number, decoder: ValueDecoder): void {
        if (this.decoders.has(tag)) {
            throw new Error(`Decoder already registered: ${tag}`);
        }
        this.decoders.set(tag, decoder);
    }

    parse(buf: ReadBuffer): RPCMessage {
        try {
            const msgType = buf.readByte();

            switch (msgType) {
                case MessageType.Request:
                    return this.parseRequest(buf);
                case MessageType.Notification:
                    return this.parseNotification(buf);
                case MessageType.Reply:
                    return this.parseReply(buf);
                case MessageType.ReplyErr:
                    return this.parseReplyErr(buf);
                case MessageType.Cancel:
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
        const callId = msg.readInt();
        return {
            type: MessageType.Cancel,
            id: callId
        };
    }

    protected parseRequest(msg: ReadBuffer): RequestMessage {
        const callId = msg.readInt();
        const method = msg.readString();
        let args = this.readArray(msg);
        // convert `null` to `undefined`, since we don't use `null` in internal plugin APIs
        args = args.map(arg => arg === null ? undefined : arg); // eslint-disable-line no-null/no-null

        return {
            type: MessageType.Request,
            id: callId,
            method: method,
            args: args
        };
    }

    protected parseNotification(msg: ReadBuffer): NotificationMessage {
        const callId = msg.readInt();
        const method = msg.readString();
        let args = this.readArray(msg);
        // convert `null` to `undefined`, since we don't use `null` in internal plugin APIs
        args = args.map(arg => arg === null ? undefined : arg); // eslint-disable-line no-null/no-null

        return {
            type: MessageType.Notification,
            id: callId,
            method: method,
            args: args
        };
    }

    parseReply(msg: ReadBuffer): ReplyMessage {
        const callId = msg.readInt();
        const value = this.readTypedValue(msg);
        return {
            type: MessageType.Reply,
            id: callId,
            res: value
        };
    }

    parseReplyErr(msg: ReadBuffer): ReplyErrMessage {
        const callId = msg.readInt();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let err: any = this.readTypedValue(msg);
        if (err && err.$isError) {
            err = new Error();
            err.name = err.name;
            err.message = err.message;
            err.stack = err.stack;
        }
        return {
            type: MessageType.ReplyErr,
            id: callId,
            err: err
        };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readArray(buf: ReadBuffer): any[] {
        const length = buf.readInt();
        const result = new Array(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readTypedValue(buf);
        }
        return result;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    readTypedValue(buf: ReadBuffer): any {
        const type = buf.readInt();
        const decoder = this.decoders.get(type);
        if (!decoder) {
            throw new Error(`No decoder for tag ${type}`);
        }
        return decoder.read(buf, innerBuffer => this.readTypedValue(innerBuffer));
    }
}
/**
 * A MessageEncoder writes RCPMessage objects to a WriteBuffer. Note that it is
 * up to clients to commit the message. This allows for multiple messages being
 * encoded before sending.
 */
export class MessageEncoder {
    protected readonly encoders: [number, ValueEncoder][] = [];
    protected readonly registeredTags: Set<number> = new Set();

    constructor() {
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

                buf.writeInt(relevant.length);
                for (const [property, value] of relevant) {
                    buf.writeString(property);
                    recursiveEncode(buf, value);
                }
            }
        });
        this.registerEncoder(ObjectType.Undefined, {
            is: value => (typeof value === 'undefined'),
            write: () => { }
        });

        this.registerEncoder(ObjectType.ObjectArray, {
            is: value => Array.isArray(value),
            write: (buf, value) => {
                this.writeArray(buf, value);
            }
        });

        this.registerEncoder(ObjectType.ByteArray, {
            is: value => value instanceof ArrayBuffer,
            write: (buf, value) => {
                buf.writeBytes(value);
            }
        });
    }

    registerEncoder<T>(tag: number, encoder: ValueEncoder): void {
        if (this.registeredTags.has(tag)) {
            throw new Error(`Tag already registered: ${tag}`);
        }
        this.registeredTags.add(tag);
        this.encoders.push([tag, encoder]);
    }

    cancel(buf: WriteBuffer, requestId: number): void {
        buf.writeByte(MessageType.Cancel);
        buf.writeInt(requestId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    notification(buf: WriteBuffer, requestId: number, method: string, args: any[]): void {
        buf.writeByte(MessageType.Notification);
        buf.writeInt(requestId);
        buf.writeString(method);
        this.writeArray(buf, args);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    request(buf: WriteBuffer, requestId: number, method: string, args: any[]): void {
        buf.writeByte(MessageType.Request);
        buf.writeInt(requestId);
        buf.writeString(method);
        this.writeArray(buf, args);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    replyOK(buf: WriteBuffer, requestId: number, res: any): void {
        buf.writeByte(MessageType.Reply);
        buf.writeInt(requestId);
        this.writeTypedValue(buf, res);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    replyErr(buf: WriteBuffer, requestId: number, err: any): void {
        buf.writeByte(MessageType.ReplyErr);
        buf.writeInt(requestId);
        this.writeTypedValue(buf, err);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeTypedValue(buf: WriteBuffer, value: any): void {
        for (let i: number = this.encoders.length - 1; i >= 0; i--) {
            if (this.encoders[i][1].is(value)) {
                buf.writeInt(this.encoders[i][0]);
                this.encoders[i][1].write(buf, value, (innerBuffer, innerValue) => {
                    this.writeTypedValue(innerBuffer, innerValue);
                });
                return;
            }
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writeArray(buf: WriteBuffer, value: any[]): void {
        buf.writeInt(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeTypedValue(buf, value[i]);
        }
    }

}
