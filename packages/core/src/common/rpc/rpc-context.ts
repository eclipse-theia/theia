// *****************************************************************************
// Copyright (C) 2023 Ericsson and others.
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

import type { CancellationToken } from '../cancellation';
import type { RpcContext, RpcContextKey } from './rpc-server';

export class RpcContextImpl<T = unknown> implements RpcContext {

    #bindings: Map<string | symbol, unknown>;

    constructor(
        bindings: Map<string | symbol, unknown>,
        readonly sender: T,
        readonly request?: CancellationToken
    ) {
        this.#bindings = bindings;
    }

    get<U>(key: RpcContextKey<U>): U | undefined {
        return this.#bindings.get(key) as U | undefined;
    }

    require<U>(key: RpcContextKey<U>): U {
        if (!this.#bindings.has(key)) {
            throw new Error(`no value for context key: ${key.toString()}`);
        }
        return this.#bindings.get(key) as U;
    }
}
