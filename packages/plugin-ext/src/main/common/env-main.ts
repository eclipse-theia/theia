// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { interfaces } from '@theia/core/shared/inversify';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { RPCProtocol } from '../../common/rpc-protocol';
import { EnvMain } from '../../common/plugin-api-rpc';
import { isWindows, isOSX } from '@theia/core';
import { OperatingSystem } from '../../plugin/types-impl';

export class EnvMainImpl implements EnvMain {
    private envVariableServer: EnvVariablesServer;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.envVariableServer = container.get(EnvVariablesServer);
    }

    $getEnvVariable(envVarName: string): Promise<string | undefined> {
        return this.envVariableServer.getValue(envVarName).then(result => result ? result.value : undefined);
    }

    async $getClientOperatingSystem(): Promise<OperatingSystem> {
        if (isWindows) {
            return OperatingSystem.Windows;
        }
        if (isOSX) {
            return OperatingSystem.OSX;
        }
        return OperatingSystem.Linux;
    }
}
