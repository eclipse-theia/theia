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

import * as theia from '@theia/plugin';
import { RPCProtocol } from '../common/rpc-protocol';
import { EnvMain, PLUGIN_RPC_CONTEXT } from '../common/plugin-api-rpc';
import { QueryParameters } from '../common/env';
import { v4 } from 'uuid';

export abstract class EnvExtImpl {
    private proxy: EnvMain;
    private queryParameters: QueryParameters;
    private lang: string;
    private applicationName: string;
    private defaultShell: string;
    private ui: theia.UIKind;
    private envMachineId: string;
    private envSessionId: string;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.ENV_MAIN);
        this.envSessionId = v4();
        this.envMachineId = v4();
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

    setQueryParameters(queryParams: QueryParameters): void {
        this.queryParameters = queryParams;
    }

    setApplicationName(applicationName: string): void {
        this.applicationName = applicationName;
    }

    setLanguage(lang: string): void {
        this.lang = lang;
    }

    setShell(shell: string): void {
        this.defaultShell = shell;
    }

    setUIKind(uiKind: theia.UIKind): void {
        this.ui = uiKind;
    }

    getClientOperatingSystem(): Promise<theia.OperatingSystem> {
        return this.proxy.$getClientOperatingSystem();
    }

    get appName(): string {
        return this.applicationName;
    }

    abstract get appRoot(): string;

    get language(): string {
        return this.lang;
    }
    get machineId(): string {
        return this.envMachineId;
    }
    get sessionId(): string {
        return this.envSessionId;
    }
    get uriScheme(): string {
        return 'theia';
    }
    get shell(): string {
        return this.defaultShell;
    }
    get uiKind(): theia.UIKind {
        return this.ui;
    }
}
