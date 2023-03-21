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

// Based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/contrib/testing/common/testExclusions.ts

/* eslint-disable import/no-extraneous-dependencies */

import { Event } from '@theia/monaco-editor-core/esm/vs/base/common/event';
import { Iterable } from '@theia/monaco-editor-core/esm/vs/base/common/iterator';
import { Disposable } from '@theia/monaco-editor-core/esm/vs/base/common/lifecycle';
import { IStorageService, StorageScope, StorageTarget } from '@theia/monaco-editor-core/esm/vs/platform/storage/common/storage';
import { MutableObservableValue } from './observable-value';
import { StoredValue } from './stored-value';
import { InternalTestItem } from './test-types';

export class TestExclusions extends Disposable {
    private readonly excluded = this._register(
        MutableObservableValue.stored(new StoredValue<ReadonlySet<string>>({
            key: 'excludedTestItems',
            scope: StorageScope.WORKSPACE,
            target: StorageTarget.USER,
            serialization: {
                deserialize: v => new Set(JSON.parse(v)),
                serialize: v => JSON.stringify([...v])
            },
        }, this.storageService), new Set())
    );

    constructor(@IStorageService private readonly storageService: IStorageService) {
        super();
    }

    /**
     * Event that fires when the excluded tests change.
     */
    public readonly onTestExclusionsChanged: Event<unknown> = this.excluded.onDidChange;

    /**
     * Gets whether there's any excluded tests.
     */
    public get hasAny(): boolean {
        return this.excluded.value.size > 0;
    }

    /**
     * Gets all excluded tests.
     */
    public get all(): Iterable<string> {
        return this.excluded.value;
    }

    /**
     * Sets whether a test is excluded.
     */
    public toggle(test: InternalTestItem, exclude?: boolean): void {
        if (exclude !== true && this.excluded.value.has(test.item.extId)) {
            this.excluded.value = new Set(Iterable.filter(this.excluded.value, e => e !== test.item.extId));
        } else if (exclude !== false && !this.excluded.value.has(test.item.extId)) {
            this.excluded.value = new Set([...this.excluded.value, test.item.extId]);
        }
    }

    /**
     * Gets whether a test is excluded.
     */
    public contains(test: InternalTestItem): boolean {
        return this.excluded.value.has(test.item.extId);
    }

    /**
     * Removes all test exclusions.
     */
    public clear(): void {
        this.excluded.value = new Set();
    }
}
