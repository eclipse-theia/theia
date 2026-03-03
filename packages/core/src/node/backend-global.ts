// *****************************************************************************
// Copyright (C) 2025 TypeFox and others.
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

import type { AddressInfo } from 'net';
import type { ExtensionInfo } from '../common/application-protocol';
import { isPromise } from 'util/types';

export interface BackendGlobal {
    serverAddress?: Promise<AddressInfo>;
    extensionInfo: ExtensionInfo[];
}

/**
 * The global object for the backend application.
 * Used to store application-wide information.
 *
 * See {@link BackendGlobal} for more details.
 */
export const backendGlobal: BackendGlobal = globalThis as unknown as BackendGlobal;

if (backendGlobal.serverAddress !== undefined && !isPromise(backendGlobal.serverAddress)) {
    console.error('globalThis.serverAddress should be a `Promise<AddressInfo>` if defined.');
}

if (!Array.isArray(backendGlobal.extensionInfo)) {
    // Initialize to an empty array if not already set
    backendGlobal.extensionInfo = [];
}
