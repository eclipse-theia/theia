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

import { RPCProtocol } from '../api/rpc-protocol';
import { EnvMain, EnvExt, PLUGIN_RPC_CONTEXT } from '../api/plugin-api';
import { QueryParameters } from '../common/env';

export class EnvExtImpl implements EnvExt {
    private proxy: EnvMain;
    private queryParameters: QueryParameters;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.ENV_MAIN);
    }

    getEnvVariable(envVarName: string): Promise<string | undefined> {
        return this.proxy.$getEnvVariable(envVarName).then(x => {
            if (x === null) {
                return undefined;
            }
            return x;
        });
    }

    getQueryParameter(queryParamName: string): string | string[] | undefined {
        return this.queryParameters[queryParamName];
    }

    getQueryParameters(): QueryParameters {
        return this.queryParameters;
    }

    $setQueryParameters(queryParams: QueryParameters): void {
        this.queryParameters = queryParams;
    }
}
