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
import type { AnyFunction, ChannelDescriptor, Listener } from '../common';

/**
 * {@link postMessage} doesn't support channels by default so this component
 * emulates channels over messages.
 */
export const TheiaIpcWindow = Symbol('TheiaIpcWindow') as symbol & interfaces.Abstract<TheiaIpcWindow>;
export interface TheiaIpcWindow {
    on<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<MessageEvent, T>, thisArg?: object): this
    once<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<MessageEvent, T>, thisArg?: object): this
    postMessage<M>(targetOrigin: string, channel: ChannelDescriptor<(message: M) => void>, message: M, transfer?: readonly MessagePort[]): void
    removeAllListeners(channel: ChannelDescriptor): this
    removeListener<T extends AnyFunction>(channel: ChannelDescriptor<T>, listener: Listener<MessageEvent, T>, thisArg?: object): this
}
