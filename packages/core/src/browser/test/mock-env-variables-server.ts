/********************************************************************************
 * Copyright (C) 2020 Red Hat, Inc. and others.
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

import URI from '../../common/uri';
import { EnvVariablesServer, EnvVariable } from '../../common/env-variables';

export class MockEnvVariablesServerImpl implements EnvVariablesServer {

    constructor(protected readonly configDirUri: URI) { }

    getHomeDirUri(): Promise<string> {
        throw new Error('Method not implemented.');
    }
    getDrives(): Promise<string[]> {
        throw new Error('Method not implemented.');
    }

    async getConfigDirUri(): Promise<string> {
        return this.configDirUri.toString();
    }

    getExecPath(): Promise<string> {
        throw new Error('Method not implemented.');
    }

    getVariables(): Promise<EnvVariable[]> {
        throw new Error('Method not implemented.');
    }

    getValue(key: string): Promise<EnvVariable | undefined> {
        throw new Error('Method not implemented.');
    }

}
