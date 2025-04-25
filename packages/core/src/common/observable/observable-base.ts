// *****************************************************************************
// Copyright (C) 2025 1C-Soft LLC and others.
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
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/base/common/observableInternal/base.ts

import { Disposable } from '../disposable';

/**
 * Represents an observable value.
 *
 * @template T The type of values the observable can hold.
 * @template TChange Describes how or why the observable changed.
 * While observers might miss intermediate values of an observable,
 * they will receive all change notifications as long as they are subscribed.
 */
export interface Observable<T, TChange = unknown> {
    /**
     * - If an accessor is given, has the same effect as calling `accessor(this)`.
     * - If no accessor is given, uses the {@link Observable.Accessor.getCurrent current accessor} if it is set.
     * - If no accessor is given and there is no current accessor, has the same effect as calling {@link getUntracked}.
     */
    get(accessor?: Observable.Accessor): T;

    /**
     * This method is called by the framework and should not typically be called by ordinary clients.
     *
     * Returns the current value of this observable without tracking the access.
     *
     * Calls {@link Observable.Observer.handleChange} if the observable notices that its value has changed.
     */
    getUntracked(): T;

    /**
     * This method is called by the framework and should not typically be called by ordinary clients.
     *
     * Forces the observable to detect and report a change if any.
     *
     * Has the same effect as calling {@link getUntracked}, but does not force the observable
     * to actually construct the value, e.g. if change deltas are used.
     *
     * Calls {@link Observable.Observer.handleChange} if the observable notices that its value has changed.
     */
    update(): void;

    /**
     * This method is called by the framework and should not typically be called by ordinary clients.
     *
     * Adds the observer to the set of subscribed observers.
     * This method is idempotent.
     */
    addObserver(observer: Observable.Observer): void;

    /**
     * This method is called by the framework and should not typically be called by ordinary clients.
     *
     * Removes the observer from the set of subscribed observers.
     * This method is idempotent.
     */
    removeObserver(observer: Observable.Observer): void;

    /**
     * This property captures the type of change information. It should not be used at runtime.
     */
    readonly TChange?: TChange;
}

export namespace Observable {

    export type Accessor = <T>(observable: Observable<T>) => T;

    export namespace Accessor {
        let current: Accessor | undefined;

        export function getCurrent(): Accessor | undefined {
            return current;
        }

        export function runWithAccessor<T>(run: () => T, accessor: Accessor | undefined): T {
            const previous = current;
            current = accessor;
            try {
                return run();
            } finally {
                current = previous;
            }
        }
    }

    /**
     * Runs the given function within an invocation context where calling {@link Observable.get} without passing the `accessor` argument
     * will have the same effect as calling {@link Observable.getUntracked}.
     */
    export function noAutoTracking<T>(run: (accessor: Accessor | undefined) => T): T {
        const accessor = Accessor.getCurrent();
        return Accessor.runWithAccessor(() => run(accessor), undefined);
    }

    /**
     * Represents an observer that can be subscribed to an observable.
     *
     * If an observer is subscribed to an observable and that observable didn't signal
     * a change through one of the observer methods, the observer can assume that the
     * observable didn't change.
     *
     * If an observable reported a possible change, {@link Observable.update} forces
     * the observable to report the actual change if any.
     */
    export interface Observer {
        /**
         * Signals that the given observable might have changed and an update potentially modifying that observable has started.
         *
         * The method {@link Observable.update} can be used to force the observable to report the change.
         *
         * Every call of this method must eventually be accompanied with the corresponding {@link endUpdate} call.
         */
        beginUpdate<T>(observable: Observable<T>): void;

        /**
         * Signals that an update that potentially modified the given observable has ended.
         * This is a good place to react to changes.
         */
        endUpdate<T>(observable: Observable<T>): void;

        /**
         * Signals that the given observable might have changed.
         *
         * The method {@link Observable.update} can be used to force the observable to report the change.
         *
         * This method should not attempt to get the value of the given observable or any other observables.
         */
        handlePossibleChange<T>(observable: Observable<T>): void;

        /**
         * Signals that the given observable has changed.
         *
         * This method should not attempt to get the value of the given observable or any other observables.
         */
        handleChange<T, TChange>(observable: Observable<T, TChange>, change?: TChange): void;
    }

    export interface ChangeContext<T, TChange> {

        readonly observable: Observable<T, TChange>;
        readonly change: TChange;

        isChangeOf<U, UChange>(observable: Observable<U, UChange>): this is { change: UChange };
    }

    /**
     * A settable observable.
     */
    export interface Settable<T, TChange> extends Observable<T, TChange> {
        /**
         * Sets the value of this observable.
         * - If no update scope is given, uses the {@link Observable.UpdateScope.getCurrent current update scope} if it is set.
         * - If no update scope is given and there is no current update scope, a local update scope will be created, used, and disposed.
         */
        set(value: T, change?: TChange, updateScope?: UpdateScope): void;
    }

    /**
     * An observable signal can be triggered to invalidate observers.
     * Signals don't have a value - when they are triggered they indicate a change.
     */
    export interface Signal<TChange> extends Observable<void, TChange> {
        /**
         * Triggers this observable signal.
         * - If no update scope is given, uses the {@link Observable.UpdateScope.getCurrent current update scope} if it is set.
         * - If no update scope is given and there is no current update scope, a local update scope will be created, used, and disposed.
         */
        trigger(change?: TChange, updateScope?: UpdateScope): void;
    }

    /**
     * Represents an update scope in which multiple observables can be updated in a batch.
     */
    export class UpdateScope implements Disposable {

        private list: { observer: Observer; observable: Observable<unknown> }[] | undefined = [];

        /**
         * This method is called by the framework and should not typically be called by ordinary clients.
         *
         * Calls {@link Observer.beginUpdate} immediately, and {@link Observer.endUpdate} when this update scope gets disposed.
         *
         * Note that this method may be called while the update scope is being disposed.
         */
        push<T>(observer: Observer, observable: Observable<T>): void {
            if (this.list) {
                this.list.push({ observer, observable });
                observer.beginUpdate(observable);
            } else {
                throw new Error('Update scope has been disposed');
            }
        }

        dispose(): void {
            const list = this.list;
            if (list) {
                // Note: `this.push` may be called from `observer.endUpdate` directly or indirectly. This code supports it.
                UpdateScope.runWithUpdateScope(() => {
                    for (let i = 0; i < list.length; i++) {
                        const { observer, observable } = list[i];
                        observer.endUpdate(observable);
                    }
                }, this);
            }
            this.list = undefined;
        }
    }

    export namespace UpdateScope {
        let current: UpdateScope | undefined;

        export function getCurrent(): UpdateScope | undefined {
            return current;
        }

        export function runWithUpdateScope<T>(run: () => T, updateScope: UpdateScope | undefined): T {
            const previous = current;
            current = updateScope;
            try {
                return run();
            } finally {
                current = previous;
            }
        }
    }

    /**
     * Runs the given function within an update scope in which multiple observables can be updated in a batch.
     */
    export function update<T>(run: (scope: UpdateScope) => T, updateScope = UpdateScope.getCurrent()): T {
        const ownsUpdateScope = !updateScope;
        if (!updateScope) {
            updateScope = new UpdateScope();
        }
        try {
            return UpdateScope.runWithUpdateScope(() => run(updateScope), updateScope);
        } finally {
            if (ownsUpdateScope) {
                updateScope.dispose();
            }
        }
    }

    /**
     * Makes sure that the given observable is being observed until the returned disposable is disposed,
     * after which there is no longer a guarantee that the observable is being observed by at least one observer.
     *
     * This function can help keep the cache of a derived observable alive even when there might be no other observers.
     */
    export function keepObserved<T>(observable: Observable<T>): Disposable {
        const observer: Observer = {
            beginUpdate: () => { },
            endUpdate: () => { },
            handlePossibleChange: () => { },
            handleChange: () => { }
        };
        observable.addObserver(observer);
        return Disposable.create(() => {
            observable.removeObserver(observer);
        });
    }
}

export abstract class AbstractObservable<T, TChange> implements Observable<T, TChange> {

    get(accessor = Observable.Accessor.getCurrent()): T {
        return accessor ? accessor(this) : this.getValue();
    }

    getUntracked(): T {
        return this.getValue();
    }

    update(): void {
        this.getValue();
    }

    abstract addObserver(observer: Observable.Observer): void;
    abstract removeObserver(observer: Observable.Observer): void;

    protected abstract getValue(): T;
}

export abstract class BaseObservable<T, TChange = void> extends AbstractObservable<T, TChange> {

    protected readonly observers = new Set<Observable.Observer>();

    override addObserver(observer: Observable.Observer): void {
        const isFirst = this.observers.size === 0;
        this.observers.add(observer);
        if (isFirst) {
            this.onFirstObserverAdded();
        }
    }

    override removeObserver(observer: Observable.Observer): void {
        const deleted = this.observers.delete(observer);
        if (deleted && this.observers.size === 0) {
            this.onLastObserverRemoved();
        }
    }

    protected onFirstObserverAdded(): void { }
    protected onLastObserverRemoved(): void { }
}
