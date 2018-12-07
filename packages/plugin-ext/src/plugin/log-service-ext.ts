
/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { LogServiceExt, LogServiceMain, PLUGIN_RPC_CONTEXT } from '../common';
import { RPCProtocol } from '../api/rpc-protocol';

export class LogServiceExtImpl implements LogServiceExt {
    private readonly mainLogServiceProxy: LogServiceMain;

    constructor(rpc: RPCProtocol) {
        this.mainLogServiceProxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.LOG_MAIN);
    }

    async provideNewHostLogDir(): Promise<string> {
        return this.mainLogServiceProxy.$providePluginLogDirs();
    }
}
