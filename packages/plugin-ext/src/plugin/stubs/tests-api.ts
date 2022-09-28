// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

/* tslint:disable:typedef */

import { CancellationToken } from '@theia/core/lib/common/cancellation';
import type * as theia from '@theia/plugin';

export const createRunProfile = (
    label: string,
    kind: theia.TestRunProfileKind,
    runHandler: (
        request: theia.TestRunRequest,
        token: CancellationToken
    ) => Thenable<void> | void,
    isDefault?: boolean,
    tag?: theia.TestTag
) => ({
    label,
    kind,
    isDefault: isDefault ?? false,
    tag,
    runHandler,
    configureHandler: undefined,
    dispose: () => undefined,
});

export const createTestRun = (
    request: theia.TestRunRequest,
    name?: string,
    persist?: boolean
): theia.TestRun => ({
    name,
    token: CancellationToken.None,
    isPersisted: false,
    enqueued: (test: theia.TestItem) => undefined,
    started: (test: theia.TestItem) => undefined,
    skipped: (test: theia.TestItem) => undefined,
    failed: (
        test: theia.TestItem,
        message: theia.TestMessage | readonly theia.TestMessage[],
        duration?: number
    ) => undefined,
    errored: (
        test: theia.TestItem,
        message: theia.TestMessage | readonly theia.TestMessage[],
        duration?: number
    ) => undefined,
    passed: (test: theia.TestItem, duration?: number) => undefined,
    appendOutput: (
        output: string,
        location?: theia.Location,
        test?: theia.TestItem
    ) => undefined,
    end: () => undefined,
});

export const testItemCollection = {
    add: () => { },
    delete: () => { },
    forEach: () => { },
    *[Symbol.iterator]() { },
    get: () => undefined,
    replace: () => { },
    size: 0,
};

export const createTestItem = (
    id: string,
    label: string,
    uri?: theia.Uri
): theia.TestItem => ({
    id,
    label,
    uri,
    children: testItemCollection,
    parent: undefined,
    tags: [],
    canResolveChildren: false,
    busy: false,
    range: undefined,
    error: undefined,
});
