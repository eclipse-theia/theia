/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { MaybePromise, Unpromise } from '../types';

export type UndefinedOrNull<T> = T extends object
    ? { [K in keyof T]: UndefinedOrNull<T[K]> }
    : T extends undefined ? undefined | null : T;

export interface JsonRpcMethods {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [method: string]: (...args: any[]) => MaybePromise<any>
}

/**
 * Use this type to wrap your JSON-RPC service APIs to ensure you only use types that can be serialized through JSON-RPC.
 *
 * It replaces any occurence of `undefined` in the signature with `undefined | null` because when passing `undefined` it
 * becomes `null` when serialized in JSON. The implementations must be able to handle both cases.
 */
export type JsonRpcService<T extends JsonRpcMethods> = {
    [K in keyof T]: (...args: UndefinedOrNull<Parameters<T[K]>>) => Promise<UndefinedOrNull<Unpromise<ReturnType<T[K]>>>>
};
