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

import { ReadBuffer, ReadBufferImpl, WriteBuffer, WriteBufferImpl } from './message-buffer';
import { ResponseError } from './rpc-protocol';

export interface MessageCodec<From = any, To = any> {
    encode(object: From): To
    decode(encodedObject: To): From
}

/**
 * The tag values for the default {@link ValueCodec}s.
 */
export enum ObjectType {
    JSON = 0,
    Undefined = 10,
    Function = 20,
    Object = 30,
    Error = 40,
    // eslint-disable-next-line @typescript-eslint/no-shadow
    ResponseError = 50,
    UInt8Array = 60,
    Map = 70,
    Set = 80,
    ObjectArray = 90,
    Number = 100,
    Boolean = 110,
    String = 120,

}

export interface ValueCodec {
    readonly tag: number;
    /**
     * Returns true if this encoder can encode this value.
     * @param value the value to be encoded
     */
    canEncode(value: any): boolean;
    /**
     * Write the given value to the buffer. Will only be called if {@link canEncode(value)} returns true.
     * @param buf The buffer to write to
     * @param value The value to be written
     * @param visitedObjects The collection of already visited (i.e. encoded) objects. Used to detect circular references
     * @param recursiveEncode A function that will use the encoders registered on the {@link MessageEncoder}
     * to write a value to the underlying buffer. This is used mostly to write structures like an array
     * without having to know how to encode the values in the array
     */
    write(buf: WriteBuffer, value: any, visitedObjects: WeakSet<object>, recursiveEncode?: (buf: WriteBuffer, value: any, visitedObjects: WeakSet<object>) => void): void;

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

export interface SerializedError {
    readonly $isError: true;
    readonly name: string;
    readonly message: string;
    readonly stack: string;
}

export function serializeError(error: Error): SerializedError {
    const { name, message } = error;
    const stack: string = (error as any).stacktrace ?? error.stack;
    return {
        $isError: true,
        name,
        message,
        stack
    };
}

/**
 * Custom error thrown by the {@link RpcMessageEncoder} if an error occurred during the encoding and the
 * object could not be written to the given {@link WriteBuffer}
 */
export class EncodingError extends Error {
    constructor(msg: string) {
        super(msg);
    }
}

export class BinaryMessageCodec implements MessageCodec<any, Uint8Array> {

    protected valueCodecs = new Map<number, ValueCodec>();
    protected sortedValueCodecs: ValueCodec[];

    constructor(customValueCodecs: ValueCodec[] = [], overrideExisting = false) {
        this.registerDefaults();
        customValueCodecs.forEach(codec => this.registerValueCodec(codec, overrideExisting));
        // Sort registered codecs ascending by their tag value
        this.sortedValueCodecs = [...this.valueCodecs].sort((a, b) => b[0] - a[0]).map(entry => entry[1]);
    }

    protected registerDefaults(): void {
        this.registerValueCodec({
            tag: ObjectType.JSON,
            canEncode: () => true,
            write: (buf, value) => buf.writeString(JSON.stringify(value)),
            read: buf => {
                const json = buf.readString();
                return JSON.parse(json);
            }
        });
        this.registerValueCodec({
            tag: ObjectType.Undefined,
            // eslint-disable-next-line no-null/no-null
            canEncode: value => value == null,
            write: () => { },
            read: () => undefined
        });

        this.registerValueCodec({
            tag: ObjectType.Function,
            canEncode: value => typeof value === 'function',
            write: () => { },
            read: () => ({})
        });

        this.registerValueCodec({
            tag: ObjectType.Object,
            canEncode: value => !!value && typeof value === 'object',
            write: (buf, object, visitedObjects, recursiveEncode) => {
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
                    recursiveEncode?.(buf, value, visitedObjects);
                }

            },
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

        this.registerValueCodec({
            tag: ObjectType.Error,
            canEncode: value => value instanceof Error,
            write: (buf, error: Error) => buf.writeString(JSON.stringify(serializeError(error)))
            ,
            read: buf => {
                const serializedError: SerializedError = JSON.parse(buf.readString());
                const error = new Error(serializedError.message);
                Object.assign(error, serializedError);
                return error;
            }
        });

        this.registerValueCodec({
            tag: ObjectType.ResponseError,
            canEncode: value => value instanceof ResponseError,
            write: (buf, error: ResponseError) => {
                const serializedError = { ...serializeError(error), code: error.code, data: error.data };
                this.writeTypedValue(buf, serializedError, new WeakSet());
            },
            read: buf => {
                const serializedError = this.readTypedValue(buf);
                const error = new ResponseError(serializedError.code, serializedError.message, serializedError.data);
                Object.assign(error, serializedError);
                return error;
            }
        });

        this.registerValueCodec({
            tag: ObjectType.UInt8Array,
            canEncode: value => value instanceof Uint8Array,
            write: (buf, value) => {
                buf.writeBytes(value);
            },
            read: buf => buf.readBytes()
        });

        this.registerValueCodec({
            tag: ObjectType.Map,
            canEncode: value => value instanceof Map,
            write: (buf, value: Map<any, any>, visitedObjects) => this.writeArray(buf, Array.from(value.entries()), visitedObjects),
            read: buf => new Map(this.readArray(buf))
        });

        this.registerValueCodec({
            tag: ObjectType.Set,
            canEncode: value => value instanceof Set,
            write: (buf, value: Set<any>, visitedObjects) => this.writeArray(buf, [...value], visitedObjects),
            read: buf => new Set(this.readArray(buf))

        });

        this.registerValueCodec({
            tag: ObjectType.ObjectArray,
            canEncode: value => Array.isArray(value),
            write: (buf, value, visitedObjects) => {
                this.writeArray(buf, value, visitedObjects);
            },
            read: buf => this.readArray(buf)
        });

        this.registerValueCodec({
            tag: ObjectType.Number,
            canEncode: value => typeof value === 'number',
            write: (buf, value) => {
                buf.writeNumber(value);
            },
            read: buf => buf.readNumber()

        });

        this.registerValueCodec({
            tag: ObjectType.Boolean,
            canEncode: value => typeof value === 'boolean',
            write: (buf, value) => {
                buf.writeUint8(value === true ? 1 : 0);
            },
            read: buf => buf.readUint8() === 1
        });

        this.registerValueCodec({
            tag: ObjectType.String,
            canEncode: value => typeof value === 'string',
            write: (buf, value) => {
                buf.writeString(value);
            },
            read: buf => buf.readString()
        });
    }

    /**
     * Registers a new {@link ValueCodec}.
     * @param decoder the codec that should be registered.
     * @param override boolean flag to indicate wether an existing registration
     *                 with the same tag should be overwritten.
     */
    registerValueCodec(codec: ValueCodec, override = false): void {
        if (override && this.valueCodecs.has(codec.tag)) {
            throw new Error(`A value codec with the tag '${codec.tag}' is already registered`);
        }
        this.valueCodecs.set(codec.tag, codec);
    }

    encode(object: any): Uint8Array {
        const buffer = new WriteBufferImpl();
        this.writeTypedValue(buffer, object, new WeakSet());
        return buffer.getCurrentContents();
    }

    decode(buffer: Uint8Array): any {
        return this.readTypedValue(new ReadBufferImpl(buffer));
    }

    protected readArray(buf: ReadBuffer): any[] {
        const length = buf.readLength();
        const result = new Array(length);
        for (let i = 0; i < length; i++) {
            result[i] = this.readTypedValue(buf);
        }
        return result;
    }

    protected readTypedValue(buf: ReadBuffer): any {
        const type = buf.readLength();
        const decoder = this.valueCodecs.get(type);
        if (!decoder) {
            throw new Error(`No decoder for tag ${type}`);
        }
        return decoder.read(buf, innerBuffer => this.readTypedValue(innerBuffer));
    }

    protected writeTypedValue(buf: WriteBuffer, value: any, visitedObjects: WeakSet<object>): void {
        if (value && typeof value === 'object') {
            if (visitedObjects.has(value)) {
                throw new EncodingError('Object to encode contains circular references!');
            }
            visitedObjects.add(value);
        }
        try {
            for (let i = 0; i < this.sortedValueCodecs.length; i++) {
                if (this.sortedValueCodecs[i].canEncode(value)) {
                    const codec = this.sortedValueCodecs[i];
                    buf.writeLength(codec.tag);
                    codec.write(buf, value, visitedObjects, (innerBuffer, innerValue, _visitedObjects) => {
                        this.writeTypedValue(innerBuffer, innerValue, _visitedObjects);
                    });
                    return;
                }
            }
            throw new EncodingError(`No suitable value encoder found for ${value}`);
        } catch (err) {
            throw err;
        } finally {
            if (value && typeof value === 'object') {
                visitedObjects.delete(value);
            }
        }
    }

    protected writeArray(buf: WriteBuffer, value: any[], visitedObjects: WeakSet<object>): void {
        buf.writeLength(value.length);
        for (let i = 0; i < value.length; i++) {
            this.writeTypedValue(buf, value[i], visitedObjects);
        }
    }
}
