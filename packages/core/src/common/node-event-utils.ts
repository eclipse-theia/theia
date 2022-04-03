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

import { Disposable, DisposableCollection } from '../common';

export type EventNames<T extends NodeJS.EventEmitter> = Parameters<T['on']>[0];
export type Listener<T extends NodeJS.EventEmitter, K extends EventNames<T> = EventNames<T>> = Parameters<T['on']>[0] extends K ? Parameters<T['on']>[1] : never;

export function createDisposableListener<T extends unknown[]>(
    emitter: NodeJS.EventEmitter,
    signal: string,
    handler: (...args: T) => void
): Disposable {
    emitter.on(signal, handler);
    return Disposable.create(() => { try { emitter.off(signal, handler); } catch { } });
}

export function pushDisposableListener<T extends unknown[]>(
    collection: DisposableCollection,
    emitter: NodeJS.EventEmitter,
    signal: string,
    handler: (...args: T) => void
): void {
    collection.push(createDisposableListener(emitter, signal, handler));
}
