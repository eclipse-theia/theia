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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/base/common/observableInternal/autorun.ts

import { Disposable } from '../disposable';
import { Observable } from './observable-base';

export class Autorun<TChangeSummary = unknown> implements Disposable {

    protected state = Autorun.State.Stale;
    protected updateCount = 0;
    protected disposed = false;
    protected isRunning = false;
    protected dependencies = new Set<Observable<unknown>>();
    protected dependenciesToBeRemoved?: Set<Observable<unknown>>;
    protected readonly dependencyObserver = this.createDependencyObserver();
    protected readonly createChangeSummary?: () => TChangeSummary;
    protected readonly willHandleChange?: <T, TChange>(context: Observable.ChangeContext<T, TChange>, changeSummary: TChangeSummary | undefined) => boolean;
    protected changeSummary?: TChangeSummary;

    constructor(
        protected readonly doRun: (args: Autorun.Args<TChangeSummary>) => void,
        options?: Autorun.Options<TChangeSummary>
    ) {
        this.createChangeSummary = options?.createChangeSummary;
        this.willHandleChange = options?.willHandleChange;
        this.changeSummary = this.createChangeSummary?.();
        try {
            this.run(true);
        } catch (e) {
            this.dispose();
            throw e;
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const dependency of this.dependencies) {
            dependency.removeObserver(this.dependencyObserver);
        }
        this.dependencies.clear();
    }

    protected run(isFirstRun = false): void {
        if (this.disposed) {
            return;
        }

        this.dependenciesToBeRemoved = this.dependencies;
        this.dependencies = new Set<Observable<unknown>>();

        this.state = Autorun.State.UpToDate;

        try {
            const { changeSummary } = this;
            this.changeSummary = this.createChangeSummary?.();
            this.isRunning = true;
            Observable.Accessor.runWithAccessor(() => this.doRun({ autorun: this, isFirstRun, changeSummary }), dependency => this.watchDependency(dependency));
        } finally {
            this.isRunning = false;
            // We don't want our watched dependencies to think that they are no longer observed, even temporarily.
            // Thus, we only unsubscribe from dependencies that are definitely not watched anymore.
            for (const dependency of this.dependenciesToBeRemoved) {
                dependency.removeObserver(this.dependencyObserver);
            }
            this.dependenciesToBeRemoved = undefined;
        }
    }

    protected watchDependency<T>(dependency: Observable<T>): T {
        if (!this.isRunning) {
            throw new Error('The accessor may only be called while the autorun is running');
        }

        // In case the run action disposed the autorun.
        if (this.disposed) {
            return dependency.getUntracked();
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
        return {
            beginUpdate: () => {
                if (this.state === Autorun.State.UpToDate) {
                    this.state = Autorun.State.DependenciesMightHaveChanged;
                }
                this.updateCount++;
            },

            endUpdate: () => {
                this.updateCount--;
                if (this.updateCount === 0) {
                    do {
                        if (this.state === Autorun.State.DependenciesMightHaveChanged) {
                            this.state = Autorun.State.UpToDate;
                            for (const dependency of this.dependencies) {
                                dependency.update(); // might call handleChange indirectly, which could make us stale
                                if (this.state as Autorun.State === Autorun.State.Stale) {
                                    // The other dependencies will refresh on demand
                                    break;
                                }
                            }
                        }

                        if (this.state !== Autorun.State.UpToDate) {
                            try {
                                this.run();
                            } catch (e) {
                                console.error(e);
                            }
                        }
                        // In case the run action changed one of our dependencies, we need to run again.
                    } while (this.state !== Autorun.State.UpToDate);
                }
                if (this.updateCount < 0) {
                    throw new Error('Unexpected update count: ' + this.updateCount);
                }
            },

            handlePossibleChange: <T>(observable: Observable<T>) => {
                if (this.state === Autorun.State.UpToDate && this.dependencies.has(observable) && !this.dependenciesToBeRemoved?.has(observable)) {
                    this.state = Autorun.State.DependenciesMightHaveChanged;
                }
            },

            handleChange: <T, TChange>(observable: Observable<T, TChange>, change: TChange) => {
                if (this.dependencies.has(observable) && !this.dependenciesToBeRemoved?.has(observable)) {
                    let shouldReact = true;
                    if (this.willHandleChange) {
                        try {
                            shouldReact = this.willHandleChange({
                                observable,
                                change,
                                isChangeOf: <U, UChange>(o: Observable<U, UChange>): this is { change: UChange } => o as unknown === observable
                            }, this.changeSummary);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                    if (shouldReact) {
                        this.state = Autorun.State.Stale;
                    }
                }
            }
        };
    }
}

export namespace Autorun {

    /**
     * Runs the given {@link run} function immediately, and whenever an update scope ends
     * and an observable tracked as a dependency of the autorun has changed.
     *
     * Note that the run function of the autorun is called within an invocation context where
     * the {@link Observable.Accessor.getCurrent current accessor} is set to track the autorun
     * dependencies, so that any observables accessed with `get()` will automatically be tracked.
     * Occasionally, it might be useful to disable such automatic tracking and track the dependencies
     * manually with `get(accessor)`. This can be done using the {@link Observable.noAutoTracking} function,
     * e.g.
     * ```ts
     * this.toDispose.push(Autorun.create(() => Observable.noAutoTracking(accessor => {
     *    const value1 = this.observable1.get(accessor); // the autorun will depend on this observable...
     *    const value2 = this.observable2.get(); // ...but not on this observable
     * })));
     * ```
     * In particular, this pattern might be useful when copying existing autorun code from VS Code,
     * where observables can only be tracked manually with `read(reader)`, which corresponds to
     * `get(accessor)` in Theia; calls to `get()` never cause an observable to be tracked. This directly
     * corresponds to disabling automatic tracking in Theia with {@link Observable.noAutoTracking}.
     */
    export function create<TChangeSummary = void>(run: (args: Args<TChangeSummary>) => void, options?: Options<TChangeSummary>): Disposable {
        return new Autorun(run, options);
    }

    export interface Args<TChangeSummary> {
        readonly autorun: Disposable;
        readonly isFirstRun: boolean;
        /**
         * The change summary with the changes collected from the start of the previous run of the autorun until the start of this run.
         *
         * The change summary is created by {@link Options.createChangeSummary} and
         * the changes are collected by {@link Options.willHandleChange}.
         */
        readonly changeSummary: TChangeSummary | undefined;
    };

    export interface Options<TChangeSummary> {
        /**
         * Creates a change summary that can collect the changes reported by the observed dependencies to {@link willHandleChange}.
         */
        createChangeSummary?: () => TChangeSummary;

        /**
         * Handles a change reported by an observed dependency, e.g. by adding it to the {@link changeSummary}.
         * Returns `true` if the reported change should be reacted to, and `false` if it should be ignored.
         */
        willHandleChange?: <T, TChange>(context: Observable.ChangeContext<T, TChange>, changeSummary: TChangeSummary | undefined) => boolean;
    }

    export const enum State {
        /**
         * Dependencies might have changed. Need to check if at least one dependency has actually changed.
         */
        DependenciesMightHaveChanged,

        /**
         * A dependency has changed. Need to (re-)run.
         */
        Stale,

        /**
         * All is up to date.
         */
        UpToDate
    }
}
