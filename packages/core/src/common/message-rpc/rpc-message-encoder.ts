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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************
/* eslint-disable @typescript-eslint/no-explicit-any */

import { Packr as MsgPack } from 'msgpackr';
import { ReadBuffer, WriteBuffer } from './message-buffer';
import { MsgPackExtensionManager } from './msg-pack-extension-manager';

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
    id?: number;
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
 * Custom error thrown by the {@link RpcMessageEncoder} if an error occurred during the encoding and the
 * object could not be written to the given {@link WriteBuffer}
 */
export class EncodingError extends Error {
    constructor(msg: string, public cause?: Error) {
        super(msg);
    }
}

/**
 * A `RpcMessageDecoder` parses a a binary message received via {@link ReadBuffer} into a {@link RpcMessage}
 */
export interface RpcMessageDecoder {
    parse(buffer: ReadBuffer): RpcMessage;
}

/**
 * A `RpcMessageEncoder` writes {@link RpcMessage} objects to a {@link WriteBuffer}. Note that it is
 * up to clients to commit the message. This allows for multiple messages being
 * encoded before sending.
 */
export interface RpcMessageEncoder {
    cancel(buf: WriteBuffer, requestId: number): void;

    notification(buf: WriteBuffer, method: string, args: any[], id?: number): void

    request(buf: WriteBuffer, requestId: number, method: string, args: any[]): void

    replyOK(buf: WriteBuffer, requestId: number, res: any): void

    replyErr(buf: WriteBuffer, requestId: number, err: any): void

}

export const defaultMsgPack = new MsgPack({ moreTypes: true, encodeUndefinedAsNil: false, bundleStrings: false });

export class MsgPackMessageEncoder implements RpcMessageEncoder {

    constructor(protected readonly msgPack: MsgPack = defaultMsgPack) { }

    cancel(buf: WriteBuffer, requestId: number): void {
        this.encode<CancelMessage>(buf, { type: RpcMessageType.Cancel, id: requestId });
    }
    notification(buf: WriteBuffer, method: string, args: any[], id?: number): void {
        this.encode<NotificationMessage>(buf, { type: RpcMessageType.Notification, method, args, id });
    }
    request(buf: WriteBuffer, requestId: number, method: string, args: any[]): void {
        this.encode<RequestMessage>(buf, { type: RpcMessageType.Request, id: requestId, method, args });
    }
    replyOK(buf: WriteBuffer, requestId: number, res: any): void {
        this.encode<ReplyMessage>(buf, { type: RpcMessageType.Reply, id: requestId, res });
    }
    replyErr(buf: WriteBuffer, requestId: number, err: any): void {
        this.encode<ReplyErrMessage>(buf, { type: RpcMessageType.ReplyErr, id: requestId, err });
    }

    encode<T = unknown>(buf: WriteBuffer, value: T): void {
        try {
            buf.writeBytes(this.msgPack.encode(value));
        } catch (err) {
            if (err instanceof Error) {
                throw new EncodingError(`Error during encoding: '${err.message}'`, err);
            }
            throw err;
        }
    }
}

export class MsgPackMessageDecoder implements RpcMessageDecoder {
    constructor(protected readonly msgPack: MsgPack = defaultMsgPack) { }

    decode<T = any>(buf: ReadBuffer): T {
        const bytes = buf.readBytes();
        return this.msgPack.decode(bytes);
    }

    parse(buffer: ReadBuffer): RpcMessage {
        return this.decode(buffer);
    }
}

export function registerMsgPackExtensions(): void {
    // Register custom msgPack extension for Errors.
    MsgPackExtensionManager.getInstance().registerExtensions({
        class: Error,
        tag: 1,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        serialize: (error: any) => {
            const { code, data, message, name } = error;
            const stack = error.stacktrace ?? error.stack;
            const isResponseError = error instanceof ResponseError;
            return { code, data, message, name, stack, isResponseError };
        },
        deserialize: data => {
            const error = data.isResponseError ? new ResponseError(data.code, data.message, data.data) : new Error(data.message);
            error.name = data.name;
            error.stack = data.stack;
            return error;
        }
    });
}
