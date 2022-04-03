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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************
import { Event, Emitter } from './event';

/**
 * The disposable pattern is helpful when dealing with resource allocations.
 * There are no destructors in TypeScript/JavaScript, and even though objects
 * are garbage collected you cannot listen for that event.
 *
 * Instead whenever an object handles resources that should be cleaned, it
 * may implement `Disposable` so that its "owner" can call this method
 * when the instance and its dependencies are no longer required.
 *
 * Note that `Disposable` instances should only be disposed once, it is
 * undefined behavior to dispose the same instance multiple times.
 */
export interface Disposable {
    /**
     * Dispose resources allocated by this object.
     */
    dispose(): void;
}

export namespace Disposable {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    export function is(arg: any): arg is Disposable {
        return !!arg && typeof arg === 'object' && 'dispose' in arg && typeof arg['dispose'] === 'function';
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

export class DisposableCollection implements Disposable {

    protected disposables: Disposable[] = [];
    protected onDisposeEmitter = new Emitter<void>();

    /**
     * Internal flag set when processing disposables.
     */
    private disposingElements = false;

    constructor(...disposables: Disposable[]) {
        this.pushAll(disposables);
    }

    get disposed(): boolean {
        return this.disposables.length === 0;
    }

    /**
     * This event is fired only once
     * on first dispose of not empty collection.
     */
    get onDispose(): Event<void> {
        return this.onDisposeEmitter.event;
    }

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

    /**
     * Pass-through method to register a disposable while passing it back to
     * the caller.
     *
     * @param disposable
     * @returns The passed `disposable`.
     */
    pushThru<T extends Disposable>(disposable: T): T {
        this.push(disposable);
        return disposable;
    }

    protected checkDisposed(): void {
        if (this.disposed && !this.disposingElements) {
            this.onDisposeEmitter.fire(undefined);
            this.onDisposeEmitter.dispose();
        }
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
