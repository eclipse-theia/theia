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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { WebContents } from '@theia/electron/shared/electron';
import { RpcContextEvent } from 'src/common/rpc/rpc-server';
import { RpcContext, RpcContextKey } from '../common';

export const SenderWebContents = RpcContextKey<WebContents>(Symbol('sender:WebContents'));

class ToSender extends RpcContextEvent<unknown> {
    constructor(readonly sender: WebContents, value?: unknown) {
        super(value);
    }
}

export class ElectronMainRpcContext implements RpcContext {

    constructor(
        protected sender: WebContents,
        protected bindings: Map<string | symbol, unknown>
    ) {
        this.bindings.set(SenderWebContents, sender);
    }

    get<T = any>(key: RpcContextKey<T>): T | undefined {
        return this.bindings.get(key) as T | undefined;
    }

    require<T = any>(key: RpcContextKey<T>): T {
        if (!this.bindings.has(key)) {
            throw new Error(`no value for context key: ${key.toString()}`);
        }
        return this.bindings.get(key) as T;
    }

    toSender(event?: unknown): RpcContextEvent<any> {
        return new ToSender(this.sender, event);
    }
}
