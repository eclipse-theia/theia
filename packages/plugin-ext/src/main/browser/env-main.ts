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

import { interfaces } from "inversify";
import { EnvVariablesServer } from "@theia/core/lib/common/env-variables";
import { RPCProtocol } from "../../api/rpc-protocol";
import { EnvMain, EnvExt, MAIN_RPC_CONTEXT } from "../../api/plugin-api";
import { QueryParameters } from "../../common/env";

export class EnvMainImpl implements EnvMain {
    private proxy: EnvExt;
    private envVariableServer: EnvVariablesServer;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.ENV_EXT);

        this.envVariableServer = container.get(EnvVariablesServer);

        this.proxy.$setQueryParameters(this.getQueryParameters());
    }

    /**
     * Returns query parameters from current page.
     */
    private getQueryParameters(): QueryParameters {
        const queryParameters: QueryParameters = {};
        if (window.location.search !== '') {
            const queryParametersString = window.location.search.substr(1); // remove question mark
            const params = queryParametersString.split('&');
            for (const pair of params) {
                if (pair === '') {
                    continue;
                }

                const keyValue = pair.split('=');
                let key: string = keyValue[0];
                let value: string = keyValue[1] ? keyValue[1] : '';
                try {
                    key = decodeURIComponent(key);
                    if (value !== '') {
                        value = decodeURIComponent(value);
                    }
                } catch (error) {
                    // skip malformed URI sequence
                    continue;
                }

                const existedValue = queryParameters[key];
                if (existedValue) {
                    if (existedValue instanceof Array) {
                        existedValue.push(value);
                    } else {
                        // existed value is string
                        queryParameters[key] = [existedValue, value];
                    }
                } else {
                    queryParameters[key] = value;
                }
            }
        }
        return queryParameters;
    }

    $getEnvVariable(envVarName: string): Promise<string | undefined> {
        return this.envVariableServer.getValue(envVarName).then(result => result ? result.value : undefined);
    }

}
