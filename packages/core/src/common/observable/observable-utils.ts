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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/base/common/observableInternal/utils.ts,
// https://github.com/microsoft/vscode/blob/1.96.3/src/vs/base/common/observableInternal/utilsCancellation.ts

import { CancellationError, CancellationToken } from '../cancellation';
import { Disposable, DisposableCollection } from '../disposable';
import { Observable } from './observable-base';
import { DerivedObservable } from './derived-observable';
import { Autorun } from './autorun';

export namespace ObservableUtils {

    /**
     * Creates an {@link Autorun.create autorun} that passes a collector for disposable objects to the {@link run} function.
     * The collected disposables are disposed before the next run or when the autorun is disposed.
     */
    export function autorunWithDisposables<TChangeSummary = void>(
        run: (args: Autorun.Args<TChangeSummary> & { readonly toDispose: { push(disposable: Disposable): void } }) => void,
        options?: Autorun.Options<TChangeSummary>
    ): Disposable {
        let toDispose: DisposableCollection | undefined = undefined;
        return new class extends Autorun<TChangeSummary> {
            override dispose(): void {
                super.dispose();
                toDispose?.dispose();
            }
        }(
            ({ autorun, isFirstRun, changeSummary }) => {
                toDispose?.dispose();
                toDispose = new DisposableCollection();
                run({ toDispose, autorun, isFirstRun, changeSummary });
            },
            options
        );
    }

    export function derivedObservableWithCache<T, TChangeSummary = void>(
        compute: (args: DerivedObservable.Args<TChangeSummary> & { readonly lastValue: T | undefined }) => T,
        options?: DerivedObservable.Options<T, TChangeSummary>
    ): Observable<T, void> {
        let value: T | undefined = undefined;
        return new DerivedObservable(
            ({ changeSummary }) => {
                value = compute({ lastValue: value, changeSummary });
                return value;
            },
            options
        );
    }

    /**
     * Resolves the promise when the observable's state matches the predicate.
     */
    export function waitForState<T>(observable: Observable<T | undefined>): Promise<T>;
    export function waitForState<T, TState extends T>(observable: Observable<T>, predicate: (state: T) => state is TState,
        isError?: (state: T) => boolean | unknown | undefined, cancellationToken?: CancellationToken
    ): Promise<TState>;
    export function waitForState<T>(observable: Observable<T>, predicate: (state: T) => boolean,
        isError?: (state: T) => boolean | unknown | undefined, cancellationToken?: CancellationToken
    ): Promise<T>;
    export function waitForState<T>(observable: Observable<T>, predicate?: (state: T) => boolean,
        isError?: (state: T) => boolean | unknown | undefined, cancellationToken?: CancellationToken
    ): Promise<T> {
        if (!predicate) {
            predicate = state => !!state;
        }
        return new Promise((resolve, reject) => {
            const stateObservable = DerivedObservable.create(() => {
                const state = observable.get();
                return {
                    isFinished: predicate(state),
                    error: isError ? isError(state) : false,
                    state
                };
            });
            const autorun_ = Autorun.create(({ autorun }) => {
                const { isFinished, error, state } = stateObservable.get();
                if (isFinished || error) {
                    autorun.dispose();
                    if (error) {
                        reject(error === true ? state : error);
                    } else {
                        resolve(state);
                    }
                }
            });
            if (cancellationToken) {
                const subscription = cancellationToken.onCancellationRequested(() => {
                    autorun_.dispose();
                    subscription.dispose();
                    reject(new CancellationError());
                });
                if (cancellationToken.isCancellationRequested) {
                    autorun_.dispose();
                    subscription.dispose();
                    reject(new CancellationError());
                }
            }
        });
    }
}
