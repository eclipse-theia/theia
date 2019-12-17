/********************************************************************************
 * Copyright (C) 2019 Red Hat, Inc. and others.
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

import { RPCProtocol } from '../common/rpc-protocol';
import { PLUGIN_RPC_CONTEXT, EnvMain } from '../common';
import { EnvVariablesServer, EnvVariable } from '@theia/core/lib/common/env-variables';

export class EnvVariablesServerExt implements EnvVariablesServer {

    protected readonly proxy: EnvMain;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.ENV_MAIN);
    }

    getExecPath(): Promise<string> {
        return this.proxy.$getExecPath();
    }

    getVariables(): Promise<EnvVariable[]> {
        return this.proxy.$getAllEnvVariables();
    }

    $getAllEnvVariables(): Promise<EnvVariable[]> {
        return this.proxy.$getAllEnvVariables();
    }

    async getValue(name: string): Promise<EnvVariable | undefined> {
        const value = await this.proxy.$getEnvVariable(name);
        return { name, value };
    }

    getUserHomeFolderPath(): Promise<string> {
        return this.proxy.$getUserHomeFolderPath();
    }

    getDataFolderName(): Promise<string> {
        return this.proxy.$getDataFolderName();
    }

    getUserDataFolderPath(): Promise<string> {
        return this.proxy.$getUserDataFolderPath();
    }

    getAppDataPath(): Promise<string> {
        return this.proxy.$getAppDataPath();
    }

}
