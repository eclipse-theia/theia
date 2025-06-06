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

import { BaseObservable, Observable } from './observable-base';

export class SettableObservable<T, TChange = void> extends BaseObservable<T, TChange> implements Observable.Settable<T, TChange> {

    protected value: T;
    protected readonly isEqual: (a: T, b: T) => boolean;

    constructor(
        initialValue: T,
        options?: SettableObservable.Options<T>
    ) {
        super();
        this.value = initialValue;
        this.isEqual = options?.isEqual ?? ((a, b) => a === b);
    }

    protected override getValue(): T {
        return this.value;
    }

    set(value: T, change?: TChange, updateScope = Observable.UpdateScope.getCurrent()): void {
        if (change === undefined && this.isEqual(this.value, value)) {
            return;
        }

        Observable.update(scope => {

            this.setValue(value);

            for (const observer of this.observers) {
                scope.push(observer, this);
                observer.handleChange(this, change);
            }

        }, updateScope);
    }

    protected setValue(newValue: T): void {
        this.value = newValue;
    }
}

export namespace SettableObservable {

    export function create<T, TChange = void>(initialValue: T, options?: Options<T>): Observable.Settable<T, TChange> {
        return new SettableObservable<T, TChange>(initialValue, options);
    }

    export interface Options<T> {
        isEqual?: (a: T, b: T) => boolean;
    }
}
