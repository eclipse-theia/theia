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
// copied and modified from https://github.com/microsoft/vscode/blob/1.96.3/src/vs/base/common/observableInternal/utils.ts

import { Disposable } from '../disposable';
import { Event } from '../event';
import { BaseObservable, Observable } from './observable-base';

export class ObservableFromEvent<T, E> extends BaseObservable<T> {

    protected value?: T;
    protected subscription?: Disposable;
    protected readonly isEqual: (a: T, b: T) => boolean;
    protected readonly getUpdateScope: () => Observable.UpdateScope | undefined;

    constructor(
        protected readonly event: Event<E>,
        protected readonly compute: (e: E | undefined) => T,
        options?: ObservableFromEvent.Options<T>
    ) {
        super();
        this.isEqual = options?.isEqual ?? ((a, b) => a === b);
        this.getUpdateScope = options?.getUpdateScope ?? Observable.UpdateScope.getCurrent;
    }

    protected handleEvent(e: E | undefined): void {
        const hadValue = this.hasValue();
        const oldValue = this.value;

        this.value = this.compute(e);

        const didChange = hadValue && !this.isEqual(oldValue!, this.value);

        if (didChange) {
            Observable.update(scope => {

                for (const observer of this.observers) {
                    scope.push(observer, this);
                    observer.handleChange(this);
                }

            }, this.getUpdateScope());
        }
    };

    protected override onFirstObserverAdded(): void {
        this.subscription = this.event(this.handleEvent, this);
    }

    protected override onLastObserverRemoved(): void {
        this.subscription?.dispose();
        this.subscription = undefined;
        delete this.value;
    }

    protected hasValue(): boolean {
        return 'value' in this;
    }

    protected override getValue(): T {
        if (this.subscription) {
            if (!this.hasValue()) {
                this.handleEvent(undefined);
            }
            return this.value!;
        } else {
            return this.compute(undefined);
        }
    }
}

export namespace ObservableFromEvent {

    export function create<T, E>(event: Event<E>, compute: (e: E | undefined) => T, options?: Options<T>): Observable<T, void> {
        return new ObservableFromEvent(event, compute, options);
    }

    export interface Options<T> {
        isEqual?: (a: T, b: T) => boolean;
        getUpdateScope?: () => Observable.UpdateScope | undefined;
    }
}

export class ObservableSignalFromEvent extends BaseObservable<void> {

    protected subscription?: Disposable;
    protected readonly getUpdateScope: () => Observable.UpdateScope | undefined;

    constructor(
        protected readonly event: Event<unknown>,
        options?: ObservableSignalFromEvent.Options
    ) {
        super();
        this.getUpdateScope = options?.getUpdateScope ?? Observable.UpdateScope.getCurrent;
    }

    protected handleEvent(): void {
        Observable.update(scope => {

            for (const observer of this.observers) {
                scope.push(observer, this);
                observer.handleChange(this);
            }

        }, this.getUpdateScope());
    };

    protected override onFirstObserverAdded(): void {
        this.subscription = this.event(this.handleEvent, this);
    }

    protected override onLastObserverRemoved(): void {
        this.subscription?.dispose();
        this.subscription = undefined;
    }

    protected override getValue(): void {
        // NO OP
    }
}

export namespace ObservableSignalFromEvent {

    export function create(event: Event<unknown>): Observable<void> {
        return new ObservableSignalFromEvent(event);
    }

    export interface Options {
        getUpdateScope?: () => Observable.UpdateScope | undefined;
    }
}
