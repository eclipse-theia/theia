// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { Event, Emitter } from './event';
import { isFunction, isObject } from './types';

export interface Disposable {
    /**
     * Dispose this object.
     */
    dispose(): void;
}

export namespace Disposable {
    export function is(arg: unknown): arg is Disposable {
        return isObject<Disposable>(arg) && isFunction(arg.dispose);
    }
    export function create(func: () => void): Disposable {
        return { dispose: func };
    }
    /** Always provides a reference to a new disposable. */
    export declare const NULL: Disposable;
}

/**
 * Ensures that every reference to {@link Disposable.NULL} returns a new object,
 * as sharing a disposable between multiple {@link DisposableCollection} can have unexpected side effects
 */
Object.defineProperty(Disposable, 'NULL', {
    configurable: false,
    enumerable: true,
    get(): Disposable {
        return { dispose: () => { } };
    }
});

/**
 * Utility for tracking a collection of Disposable objects.
 *
 * This utility provides a number of benefits over just using an array of
 * Disposables:
 *
 * - the collection is auto-pruned when an element it contains is disposed by
 * any code that has a reference to it
 * - you can register to be notified when all elements in the collection have
 * been disposed [1]
 * - you can conveniently dispose all elements by calling dispose()
 * on the collection
 *
 * Unlike an array, however, this utility does not give you direct access to
 * its elements.
 *
 * Being notified when all elements are disposed is simple:
 * ```
 * const dc = new DisposableCollection(myDisposables);
 * dc.onDispose(() => {
 *    console.log('All elements in the collection have been disposed');
 * });
 * ```
 *
 * [1] The collection will notify only once. It will continue to function in so
 * far as accepting new Disposables and pruning them when they are disposed, but
 * such activity will never result in another notification.
 */
export class DisposableCollection implements Disposable {

    protected readonly disposables: Disposable[] = [];
    protected readonly onDisposeEmitter = new Emitter<void>();

    constructor(...toDispose: Disposable[]) {
        toDispose.forEach(d => this.push(d));
    }

    /**
     * This event is fired only once
     * on first dispose of not empty collection.
     */
    get onDispose(): Event<void> {
        return this.onDisposeEmitter.event;
    }

    protected checkDisposed(): void {
        if (this.disposed && !this.disposingElements) {
            this.onDisposeEmitter.fire(undefined);
            this.onDisposeEmitter.dispose();
        }
    }

    get disposed(): boolean {
        return this.disposables.length === 0;
    }

    private disposingElements = false;
    dispose(): void {
        if (this.disposed || this.disposingElements) {
            return;
        }
        this.disposingElements = true;
        while (!this.disposed) {
            try {
                this.disposables.pop()!.dispose();
            } catch (e) {
                console.error(e);
            }
        }
        this.disposingElements = false;
        this.checkDisposed();
    }

    push(disposable: Disposable): Disposable {
        const disposables = this.disposables;
        disposables.push(disposable);
        const originalDispose = disposable.dispose.bind(disposable);
        const toRemove = Disposable.create(() => {
            const index = disposables.indexOf(disposable);
            if (index !== -1) {
                disposables.splice(index, 1);
            }
            this.checkDisposed();
        });
        disposable.dispose = () => {
            toRemove.dispose();
            disposable.dispose = originalDispose;
            originalDispose();
        };
        return toRemove;
    }

    pushAll(disposables: Disposable[]): Disposable[] {
        return disposables.map(disposable =>
            this.push(disposable)
        );
    }

}

export type DisposableGroup = { push(disposable: Disposable): void } | { add(disposable: Disposable): void };
export namespace DisposableGroup {
    export function canPush(candidate?: DisposableGroup): candidate is { push(disposable: Disposable): void } {
        return Boolean(candidate && (candidate as { push(): void }).push);
    }
    export function canAdd(candidate?: DisposableGroup): candidate is { add(disposable: Disposable): void } {
        return Boolean(candidate && (candidate as { add(): void }).add);
    }
}

export function disposableTimeout(...args: Parameters<typeof setTimeout>): Disposable {
    const handle = setTimeout(...args);
    return { dispose: () => clearTimeout(handle) };
}

/**
 * Wrapper for a {@link Disposable} that is not available immediately.
 */
export class DisposableWrapper implements Disposable {

    private disposed = false;
    private disposable: Disposable | undefined = undefined;

    set(disposable: Disposable): void {
        if (this.disposed) {
            disposable.dispose();
        } else {
            this.disposable = disposable;
        }
    }

    dispose(): void {
        this.disposed = true;
        if (this.disposable) {
            this.disposable.dispose();
            this.disposable = undefined;
        }
    }
}
