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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/base/common/observableInternal/derived.ts

import { BaseObservable, Observable } from './observable-base';

/**
 * An observable that is derived from other observables.
 * Its value is only (re-)computed when absolutely needed.
 */
export class DerivedObservable<T, TChangeSummary = unknown> extends BaseObservable<T> {

    protected state = DerivedObservable.State.Initial;
    protected value?: T;
    protected updateCount = 0;
    protected isComputing = false;
    protected dependencies = new Set<Observable<unknown>>();
    protected dependenciesToBeRemoved?: Set<Observable<unknown>>;
    protected removedObserversToCallEndUpdateOn?: Set<Observable.Observer>;
    protected readonly dependencyObserver = this.createDependencyObserver();
    protected readonly isEqual: (a: T, b: T) => boolean;
    protected readonly createChangeSummary?: () => TChangeSummary;
    protected readonly willHandleChange?: <U, UChange>(context: Observable.ChangeContext<U, UChange>, changeSummary: TChangeSummary | undefined) => boolean;
    protected changeSummary?: TChangeSummary;

    constructor(
        protected readonly compute: (args: DerivedObservable.Args<TChangeSummary>) => T,
        options?: DerivedObservable.Options<T, TChangeSummary>
    ) {
        super();
        this.isEqual = options?.isEqual ?? ((a, b) => a === b);
        this.createChangeSummary = options?.createChangeSummary;
        this.willHandleChange = options?.willHandleChange;
        this.changeSummary = this.createChangeSummary?.();
    }

    protected override onLastObserverRemoved(): void {
        // We are not tracking changes anymore, thus we have to invalidate the cached value.
        this.state = DerivedObservable.State.Initial;
        this.value = undefined;
        for (const dependency of this.dependencies) {
            dependency.removeObserver(this.dependencyObserver);
        }
        this.dependencies.clear();
    }

    protected override getValue(): T {
        if (this.isComputing) {
            throw new Error('Cyclic dependencies are not allowed');
        }

        if (this.observers.size === 0) {
            // Without observers, we don't know when to clean up stuff.
            // Thus, we don't cache anything to prevent memory leaks.
            let result;
            try {
                this.isComputing = true;
                result = Observable.Accessor.runWithAccessor(() => this.compute({ changeSummary: this.createChangeSummary?.() }), dependency => this.watchDependency(dependency));
            } finally {
                this.isComputing = false;
                // Clear new dependencies.
                this.onLastObserverRemoved();
            }
            return result;
        } else {
            do {
                if (this.state === DerivedObservable.State.DependenciesMightHaveChanged) {
                    // Need to ask our depedencies if at least one of them has actually changed.
                    for (const dependency of this.dependencies) {
                        dependency.update(); // might call handleChange indirectly, which could make us stale
                        if (this.state as DerivedObservable.State === DerivedObservable.State.Stale) {
                            // The other dependencies will refresh on demand, so early break
                            break;
                        }
                    }
                }

                // If we are still not stale, we can assume to be up to date again.
                if (this.state === DerivedObservable.State.DependenciesMightHaveChanged) {
                    this.state = DerivedObservable.State.UpToDate;
                }

                if (this.state !== DerivedObservable.State.UpToDate) {
                    this.recompute();
                }
                // In case recomputation changed one of our dependencies, we need to recompute again.
            } while (this.state !== DerivedObservable.State.UpToDate);
            return this.value!;
        }
    }

    protected recompute(): void {
        this.dependenciesToBeRemoved = this.dependencies;
        this.dependencies = new Set<Observable<unknown>>();

        const hadValue = this.state !== DerivedObservable.State.Initial;
        const oldValue = this.value;
        this.state = DerivedObservable.State.UpToDate;

        try {
            const { changeSummary } = this;
            this.changeSummary = this.createChangeSummary?.();
            this.isComputing = true;
            this.value = Observable.Accessor.runWithAccessor(() => this.compute({ changeSummary }), dependency => this.watchDependency(dependency));
        } finally {
            this.isComputing = false;
            // We don't want our watched dependencies to think that they are no longer observed, even temporarily.
            // Thus, we only unsubscribe from dependencies that are definitely not watched anymore.
            for (const dependency of this.dependenciesToBeRemoved) {
                dependency.removeObserver(this.dependencyObserver);
            }
            this.dependenciesToBeRemoved = undefined;
        }

        const didChange = hadValue && !this.isEqual(oldValue!, this.value);

        if (didChange) {
            for (const observer of this.observers) {
                observer.handleChange(this);
            }
        }
    }

    protected watchDependency<U>(dependency: Observable<U>): U {
        if (!this.isComputing) {
            throw new Error('The accessor may only be called while the compute function is running');
        }

        // Subscribe before getting the value to enable caching.
        dependency.addObserver(this.dependencyObserver);
        // This might call handleChange indirectly, which could invalidate us.
        const value = dependency.getUntracked();
        // Which is why we only add the observable to the dependencies now.
        this.dependencies.add(dependency);
        this.dependenciesToBeRemoved?.delete(dependency);
        return value;
    }

    protected createDependencyObserver(): Observable.Observer {
        let inBeginUpdate = false;
        return {
            beginUpdate: () => {
                if (inBeginUpdate) {
                    throw new Error('Cyclic dependencies are not allowed');
                }

                inBeginUpdate = true;
                try {
                    this.updateCount++;
                    const propagateBeginUpdate = this.updateCount === 1;
                    if (this.state === DerivedObservable.State.UpToDate) {
                        this.state = DerivedObservable.State.DependenciesMightHaveChanged;
                        // If we propagate begin update, that will already signal a possible change.
                        if (!propagateBeginUpdate) {
                            for (const observer of this.observers) {
                                observer.handlePossibleChange(this);
                            }
                        }
                    }
                    if (propagateBeginUpdate) {
                        for (const observer of this.observers) {
                            observer.beginUpdate(this); // signals a possible change
                        }
                    }
                } finally {
                    inBeginUpdate = false;
                }
            },

            endUpdate: () => {
                this.updateCount--;
                if (this.updateCount === 0) {
                    // Calls to endUpdate can potentially change the observers list.
                    let observers = [...this.observers];
                    for (const observer of observers) {
                        observer.endUpdate(this);
                    }
                    if (this.removedObserversToCallEndUpdateOn) {
                        observers = [...this.removedObserversToCallEndUpdateOn];
                        this.removedObserversToCallEndUpdateOn = undefined;
                        for (const observer of observers) {
                            observer.endUpdate(this);
                        }
                    }
                }
                if (this.updateCount < 0) {
                    throw new Error('Unexpected update count: ' + this.updateCount);
                }
            },

            handlePossibleChange: <U>(observable: Observable<U>) => {
                // In all other states, observers already know that we might have changed.
                if (this.state === DerivedObservable.State.UpToDate && this.dependencies.has(observable) && !this.dependenciesToBeRemoved?.has(observable)) {
                    this.state = DerivedObservable.State.DependenciesMightHaveChanged;
                    for (const observer of this.observers) {
                        observer.handlePossibleChange(this);
                    }
                }
            },

            handleChange: <U, UChange>(observable: Observable<U, UChange>, change: UChange) => {
                if (this.dependencies.has(observable) && !this.dependenciesToBeRemoved?.has(observable)) {
                    let shouldReact = true;
                    if (this.willHandleChange) {
                        try {
                            shouldReact = this.willHandleChange({
                                observable,
                                change,
                                isChangeOf: <V, VChange>(o: Observable<V, VChange>): this is { change: VChange } => o as unknown === observable
                            }, this.changeSummary);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                    const wasUpToDate = this.state === DerivedObservable.State.UpToDate;
                    if (shouldReact && (this.state === DerivedObservable.State.DependenciesMightHaveChanged || wasUpToDate)) {
                        this.state = DerivedObservable.State.Stale;
                        if (wasUpToDate) {
                            for (const observer of this.observers) {
                                observer.handlePossibleChange(this);
                            }
                        }
                    }
                }
            }
        };
    }

    override addObserver(observer: Observable.Observer): void {
        const shouldCallBeginUpdate = !this.observers.has(observer) && this.updateCount > 0;
        super.addObserver(observer);
        if (shouldCallBeginUpdate) {
            if (this.removedObserversToCallEndUpdateOn?.has(observer)) {
                this.removedObserversToCallEndUpdateOn.delete(observer);
            } else {
                observer.beginUpdate(this);
            }
        }
    }

    override removeObserver(observer: Observable.Observer): void {
        if (this.observers.has(observer) && this.updateCount > 0) {
            if (!this.removedObserversToCallEndUpdateOn) {
                this.removedObserversToCallEndUpdateOn = new Set();
            }
            this.removedObserversToCallEndUpdateOn.add(observer);
        }
        super.removeObserver(observer);
    }
}

export namespace DerivedObservable {

    export function create<T, TChangeSummary>(compute: (args: Args<TChangeSummary>) => T, options?: Options<T, TChangeSummary>): Observable<T, void> {
        return new DerivedObservable(compute, options);
    }

    export interface Args<TChangeSummary> {
        /**
         * The change summary with the changes collected from the start of the previous run of the compute function until the start of this run.
         *
         * The change summary is created by {@link Options.createChangeSummary} and
         * the changes are collected by {@link Options.willHandleChange}.
         */
        readonly changeSummary: TChangeSummary | undefined;
    }

    export interface Options<T, TChangeSummary> {
        isEqual?: (a: T, b: T) => boolean;

        /**
         * Creates a change summary that can collect the changes reported by the observed dependencies to {@link willHandleChange}.
         */
        createChangeSummary?: () => TChangeSummary;

        /**
         * Handles a change reported by an observed dependency, e.g. by adding it to the {@link changeSummary}.
         * Returns `true` if the reported change should be reacted to, and `false` if it should be ignored.
         */
        willHandleChange?: <U, UChange>(context: Observable.ChangeContext<U, UChange>, changeSummary: TChangeSummary | undefined) => boolean;
    }

    export const enum State {
        /**
         * Initial state. No cached value.
         */
        Initial,

        /**
         * Dependencies might have changed. Need to check if at least one dependency has actually changed.
         */
        DependenciesMightHaveChanged,

        /**
         * A dependency has changed. Need to recompute the cached value.
         */
        Stale,

        /**
         * The cached value is up to date.
         */
        UpToDate
    }
}
