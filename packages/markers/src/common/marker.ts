// *****************************************************************************
// Copyright (C) 2017 Ericsson and others.
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

import { isObject, isString } from '@theia/core/lib/common/types';

/*
* A marker represents meta information for a given uri
*/
export interface Marker<T> {
    /**
     * the uri this marker is associated with.
     */
    uri: string;
    /*
     * the owner of this marker. Any string provided by the registrar.
     */
    owner: string;

    /**
     * the kind, e.g. 'problem'
     */
    kind?: string;

    /*
     * marker kind specific data
     */
    data: T;
}
export namespace Marker {
    export function is(value: unknown): value is Marker<object>;
    export function is<T>(value: unknown, subTypeCheck: (value: unknown) => value is T): value is Marker<T>;
    export function is(value: unknown, subTypeCheck?: (value: unknown) => boolean): boolean {
        subTypeCheck ??= isObject;
        return isObject<Marker<object>>(value)
            && !Array.isArray(value)
            && subTypeCheck(value.data)
            && isString(value.uri)
            && isString(value.owner);
    }
}
