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

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/storedValue.ts

/* eslint-disable import/no-extraneous-dependencies */

import { Event } from '@theia/monaco-editor-core/esm/vs/base/common/event';
import { IStorageService, StorageScope, StorageTarget } from '@theia/monaco-editor-core/esm/vs/platform/storage/common/storage';

export interface IStoredValueSerialization<T> {
    deserialize(data: string): T;
    serialize(data: T): string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const defaultSerialization: IStoredValueSerialization<any> = {
    deserialize: d => JSON.parse(d),
    serialize: d => JSON.stringify(d),
};

interface IStoredValueOptions<T> {
    key: string;
    scope: StorageScope;
    target: StorageTarget;
    serialization?: IStoredValueSerialization<T>;
}

/**
 * todo@connor4312: is this worthy to be in common?
 */
export class StoredValue<T> {
    private readonly serialization: IStoredValueSerialization<T>;
    private readonly key: string;
    private readonly scope: StorageScope;
    private readonly target: StorageTarget;

    /**
     * Emitted whenever the value is updated or deleted.
     */
    public readonly onDidChange = Event.filter(this.storage.onDidChangeValue, e => e.key === this.key);

    constructor(
        options: IStoredValueOptions<T>,
        @IStorageService private readonly storage: IStorageService,
    ) {
        this.key = options.key;
        this.scope = options.scope;
        this.target = options.target;
        this.serialization = options.serialization ?? defaultSerialization;
    }

    /**
     * Reads the value, returning the undefined if it's not set.
     */
    public get(): T | undefined;

    /**
     * Reads the value, returning the default value if it's not set.
     */
    public get(defaultValue: T): T;

    public get(defaultValue?: T): T | undefined {
        const value = this.storage.get(this.key, this.scope);
        return value === undefined ? defaultValue : this.serialization.deserialize(value);
    }

    /**
     * Persists changes to the value.
     * @param value
     */
    public store(value: T): void {
        this.storage.store(this.key, this.serialization.serialize(value), this.scope, this.target);
    }

    /**
     * Delete an element stored under the provided key from storage.
     */
    public delete(): void {
        this.storage.remove(this.key, this.scope);
    }
}
