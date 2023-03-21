// *****************************************************************************
// Copyright (C) 2023 Mathieu Bussieres and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/observableValue.ts

/* eslint-disable import/no-extraneous-dependencies */

import { Emitter, Event } from '@theia/monaco-editor-core/esm/vs/base/common/event';
import { Disposable } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { StoredValue } from './stored-value';

export interface IObservableValue<T> {
    onDidChange: Event<T>;
    readonly value: T;
}

export const staticObservableValue = <T>(value: T): IObservableValue<T> => ({
    onDidChange: Event.None,
    value,
});

export class MutableObservableValue<T> extends Disposable implements IObservableValue<T> {
    private readonly changeEmitter = this._register(new Emitter<T>());

    public readonly onDidChange = this.changeEmitter.event;

    public get value(): T {
        return this._value;
    }

    public set value(v: T) {
        if (v !== this._value) {
            this._value = v;
            this.changeEmitter.fire(v);
        }
    }

    public static stored<T>(stored: StoredValue<T>, defaultValue: T): MutableObservableValue<T> {
        const o = new MutableObservableValue(stored.get(defaultValue));
        o.onDidChange(value => stored.store(value));
        return o;
    }

    constructor(private _value: T) {
        super();
    }
}
