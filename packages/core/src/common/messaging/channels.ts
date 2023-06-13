// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import type { interfaces } from 'inversify';
import { isArray, isObject } from '../types';

type AnyFunction = (...params: unknown[]) => unknown;
type Listener<E, T extends AnyFunction> = (event: E, ...params: Parameters<T>) => ReturnType<T>;

export const ChannelHandlerFactory = Symbol('ChannelHandlerFactory') as symbol & interfaces.Abstract<ChannelHandlerFactory>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ChannelHandlerFactory<T = any> = () => ChannelHandler<T>;

export interface ChannelDescriptor<T extends AnyFunction = AnyFunction> {
    channel: string;
}

export class ChannelHandler<E = void> {

    protected handlers = new Map<string, Listener<E, AnyFunction>[]>();

    createMessage<T extends AnyFunction>({ channel }: ChannelDescriptor<T>, ...params: Parameters<T>): object {
        return { channel, params };
    }

    handleMessage(message: unknown, event: E): void {
        if (!isObject(message)) {
            throw new TypeError(`invalid message type: ${typeof message}`);
        }
        const { channel, params } = message;
        if (typeof channel !== 'string' || !isArray(params)) {
            throw new TypeError(`invalid params type: ${typeof params}`);
        }
        const handlers = this.handlers.get(channel);
        if (!handlers) {
            throw new Error(`no handler for channel: "${channel}"`);
        }
        handlers.forEach(handler => handler(event, ...params));
    }

    on<T extends AnyFunction>({ channel }: ChannelDescriptor<T>, listener: Listener<E, T>, thisArg?: unknown): this {
        let handlers = this.handlers.get(channel);
        if (!handlers) {
            this.handlers.set(channel, handlers = []);
        }
        if (thisArg) {
            listener = listener.bind(thisArg);
        }
        handlers.push(listener);
        return this;
    }
}
