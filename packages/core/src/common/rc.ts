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
import type { Disposable } from './disposable';

export type Owned<T extends Disposable> = Omit<T, 'dispose'>;

/**
 * Handle to a reference counting mechanism wrapping `value: T`.
 */
export interface Rc<T extends Disposable = Disposable> extends Disposable {
    readonly count: number
    readonly value: Owned<T>
    clone(): Rc<T>
    dispose(): void
}

export const ReferenceCounter = Symbol('ReferenceCounter') as symbol & interfaces.Abstract<ReferenceCounter>;
/**
 * Service to get instances of {@link Rc}.
 */
export interface ReferenceCounter {
    /**
     * Always returns a new {@link Rc}.
     *
     * ```ts
     * const newRc = ReferenceCounter.getRc(rc.value);
     * // same as:
     * const newRc = rc.clone();
     * ```
     *
     * @param value The value to wrap in {@link Rc}.
     */
    getRc<T extends Disposable>(value: T): Rc<T>
    /**
     * @returns `true` if {@link value} has a valid `Rc<T>` referencing it.
     */
    hasRc(value: Disposable): boolean
    /**
     * Destroy the current reference count for {@link value}.
     */
    killRcs(value: Disposable): void
}
