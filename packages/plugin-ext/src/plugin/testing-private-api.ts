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

// some code copied and modified from https://github.com/microsoft/vscode/blob/1.72.2/src/vs/workbench/api/common/extHostTestingPrivateApi.ts

/* tslint:disable:typedef */

import { ExtHostTestItemEvent, InvalidTestItemError } from '@theia/testing/lib/common/test-item-collection';
import type * as theia from '@theia/plugin';

export interface IExtHostTestItemApi {
    controllerId: string;
    parent?: theia.TestItem;
    listener?: (evt: ExtHostTestItemEvent) => void;
}

const eventPrivateApis = new WeakMap<theia.TestItem, IExtHostTestItemApi>();

export const createPrivateApiFor = (impl: theia.TestItem, controllerId: string) => {
    const api: IExtHostTestItemApi = { controllerId };
    eventPrivateApis.set(impl, api);
    return api;
};

/**
 * Gets the private API for a test item implementation. This implementation
 * is a managed object, but we keep a weakmap to avoid exposing any of the
 * internals to extensions.
 */
export const getPrivateApiFor = (impl: theia.TestItem) => {
    const api = eventPrivateApis.get(impl);
    if (!api) {
        throw new InvalidTestItemError(impl?.id || '<unknown>');
    }

    return api;
};
