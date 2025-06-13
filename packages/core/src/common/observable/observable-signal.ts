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

import { BaseObservable, Observable } from './observable-base';

export class ObservableSignal<TChange> extends BaseObservable<void, TChange> implements Observable.Signal<TChange> {

    trigger(change?: TChange, updateScope = Observable.UpdateScope.getCurrent()): void {

        Observable.update(scope => {

            for (const observer of this.observers) {
                scope.push(observer, this);
                observer.handleChange(this, change);
            }

        }, updateScope);
    }

    protected override getValue(): void {
        // NO OP
    }
}

export namespace ObservableSignal {

    export function create<TChange = void>(): Observable.Signal<TChange> {
        return new ObservableSignal();
    }
}
