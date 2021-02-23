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

import { injectable, inject } from '@theia/core/shared/inversify';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class PluginVSCodeEnvironment {

    @inject(EnvVariablesServer)
    protected readonly environments: EnvVariablesServer;

    protected _extensionsDirUri: URI | undefined;
    async getExtensionsDirUri(): Promise<URI> {
        if (!this._extensionsDirUri) {
            const configDir = new URI(await this.environments.getConfigDirUri());
            this._extensionsDirUri = configDir.resolve('extensions');
        }
        return this._extensionsDirUri;
    }

}
