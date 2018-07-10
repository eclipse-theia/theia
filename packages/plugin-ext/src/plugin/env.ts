/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
