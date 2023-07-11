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
import type { FunctionBinder } from '../function-utils';
import { AnyFunction, Listener, isArray, isObject, logError } from '../types';

const NAMESPACES = new Set<string>();

/**
 * Get new {@link ChannelHandler} instances.
 */
export const ChannelHandlerFactory = Symbol('ChannelHandlerFactory') as symbol & interfaces.Abstract<ChannelHandlerFactory>;
export interface ChannelHandlerFactory {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <T = any>(): ChannelHandler<T>;
}

/**
 * Descriptor used by various Theia IPC APIs to type messages and listeners.
 */
export interface ChannelDescriptor<T extends AnyFunction = AnyFunction> {
    channel: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NamespaceTemplate = Record<string, ChannelTemplate<any>>;
type NamespaceFromTemplate<T extends NamespaceTemplate> = {
    [K in keyof T]: K extends string ? T[K] extends ChannelTemplate<infer U> ? ChannelDescriptor<U> : never : never
};

/**
 * Create a single {@link ChannelDescriptor}.
 */
export function createChannelDescriptor<T extends AnyFunction>(channel: string): ChannelDescriptor<T> {
    return { channel };
}

/**
 * Create namespaced {@link ChannelDescriptor}s.
 *
 * @param namespace String to use to prefix all channels with.
 * @param templateFactory callback returning the object used to build the namespace.
 * @example
 *
 * const MY_NAMESPACE = createChannelNamespace('prefix-for-all-channels', channel => ({
 *     firstChannel: channel<(arg1: string, arg2: number) => void>(),
 *     secondChannel: channel<() => Promise<string>>(),
 *     // ...
 * }));
 *
 * MY_NAMESPACE.firstChannel; // === IpcChannel<(arg1: string, arg2: number) => void>
 * MY_NAMESPACE.firstChannel.channel === 'prefix-for-all-channels.firstChannel';
 */
export function createChannelNamespace<T extends NamespaceTemplate>(
    namespace: string,
    templateFactory: (placeHolderChannelFactory: <U extends AnyFunction>() => ChannelTemplate<U>) => T
): NamespaceFromTemplate<T> {
    if (NAMESPACES.has(namespace)) {
        console.warn('already registered ipc channel namespace!', namespace);
    } else {
        NAMESPACES.add(namespace);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, no-null/no-null
    const result: any = Object.create(null);
    for (const name of Object.keys(templateFactory(() => new ChannelTemplate()))) {
        result[name] = { channel: `${namespace}.${name}` };
    }
    return result;
}

/**
 * Dud object used to carry type information.
 */
export class ChannelTemplate<T extends AnyFunction> { }

/**
 * Multiplixer imitating Electron's channel API.
 */
export class ChannelHandler<E = void> {

    protected handlers = new Map<string, Listener<E, AnyFunction>[]>();

    constructor(
        protected binder: FunctionBinder
    ) { }

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
        handlers.forEach(logError(handler => handler(event, ...params)));
    }

    on<T extends AnyFunction>({ channel }: ChannelDescriptor<T>, listener: Listener<E, T>, thisArg?: object): this {
        let handlers = this.handlers.get(channel);
        if (!handlers) {
            this.handlers.set(channel, handlers = []);
        }
        handlers.push(this.binder.bindfn(listener, thisArg));
        return this;
    }

    off<T extends AnyFunction>({ channel }: ChannelDescriptor<T>, listener: Listener<E, T>, thisArg?: object): this {
        const handlers = this.handlers.get(channel);
        if (handlers) {
            const idx = handlers.indexOf(this.binder.bindfn(listener, thisArg));
            if (idx !== -1) {
                handlers.splice(idx, 1);
            }
        }
        return this;
    }

    dispose(): void {
        this.handlers.clear();
    }
}
