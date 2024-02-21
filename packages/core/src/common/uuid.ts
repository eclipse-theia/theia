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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation and others. All rights reserved.
 *  Licensed under the MIT License. See https://github.com/Microsoft/vscode/blob/master/LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// based on https://github.com/microsoft/vscode/blob/1.72.2/src/vs/base/common/uuid.ts

import { v4, v5 } from 'uuid';

const _UUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: string): boolean {
    return _UUIDPattern.test(value);
}

export function generateUuid(): string {
    return v4();
}

const NAMESPACE = '4c90ee4f-d952-44b1-83ca-f04121ab8e05';
/**
 * This function will hash the given value using SHA1. The result will be a uuid.
 * @param value the string to hash
 * @returns a uuid
 */
export function hashValue(value: string): string {
    // as opposed to v4, v5 is deterministic and uses SHA1 hashing
    return v5(value, NAMESPACE);
}
