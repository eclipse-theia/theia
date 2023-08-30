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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { Disposable, DisposableCollection } from '../common';

/**
 * @param collection If a collection is passed in, the new disposable is added to that collection. Otherwise, the new disposable is returned.
 */
export function createDisposableListener<K>(
    emitter: NodeJS.EventEmitter, signal: string, handler: (event: K, ...args: unknown[]) => unknown, collection: DisposableCollection
): void;
export function createDisposableListener<K>(emitter: NodeJS.EventEmitter, signal: string, handler: (event: K, ...args: unknown[]) => unknown): Disposable;
export function createDisposableListener<K>(
    emitter: NodeJS.EventEmitter, signal: string, handler: (event: K, ...args: unknown[]) => unknown, collection?: DisposableCollection
): Disposable | void {
    emitter.on(signal, handler);
    const disposable = Disposable.create(() => { try { emitter.off(signal, handler); } catch { } });
    if (collection) {
        collection.push(disposable);
    } else {
        return disposable;
    }
}
