/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
