// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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

import { injectable, inject } from '@theia/core/shared/inversify';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class PluginVSCodeEnvironment {

    @inject(EnvVariablesServer)
    protected readonly environments: EnvVariablesServer;

    protected _userExtensionsDirUri: URI | undefined;
    protected _deployedPluginsUri: URI | undefined;
    protected _tmpDirUri: URI | undefined;

    async getUserExtensionsDirUri(): Promise<URI> {
        if (!this._userExtensionsDirUri) {
            const configDir = new URI(await this.environments.getConfigDirUri());
            this._userExtensionsDirUri = configDir.resolve('extensions');
        }
        return this._userExtensionsDirUri;
    }

    async getDeploymentDirUri(): Promise<URI> {
        if (!this._deployedPluginsUri) {
            const configDir = new URI(await this.environments.getConfigDirUri());
            this._deployedPluginsUri = configDir.resolve('deployedPlugins');
        }
        return this._deployedPluginsUri;
    }

    async getTempDirUri(prefix?: string): Promise<URI> {
        if (!this._tmpDirUri) {
            const configDir: URI = new URI(await this.environments.getConfigDirUri());
            this._tmpDirUri = configDir.resolve('tmp');
        }

        if (prefix) {
            return this._tmpDirUri.resolve(prefix);
        }

        return this._tmpDirUri;
    }
}
