/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';
import { VSCODE_DEFAULT_API_VERSION } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-types';

@injectable()
export class VSXEnvironment {

    @inject(EnvVariablesServer)
    protected readonly environments: EnvVariablesServer;

    protected _registryUri: URI | undefined;
    async getRegistryUri(): Promise<URI> {
        if (!this._registryUri) {
            const vsxRegistryUrl = await this.environments.getValue('VSX_REGISTRY_URL');
            this._registryUri = new URI(vsxRegistryUrl && vsxRegistryUrl.value || 'https://open-vsx.org');
        }
        return this._registryUri;
    }

    async getRegistryApiUri(): Promise<URI> {
        const registryUri = await this.getRegistryUri();
        return registryUri.resolve('api');
    }

    protected _apiVersion: string | undefined;
    async getVscodeApiVersion(): Promise<string> {
        if (!this._apiVersion) {
            const apiVersion = await this.environments.getValue('VSCODE_API_VERSION');
            this._apiVersion = apiVersion?.value || VSCODE_DEFAULT_API_VERSION;
        }
        return this._apiVersion;
    }

}
