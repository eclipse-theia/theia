// *****************************************************************************
// Copyright (C) 2024 TypeFox and others.
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

import { RemoteCliContext, RemoteCliContribution } from '@theia/core/lib/node/remote/remote-cli-contribution';
import { inject, injectable } from '@theia/core/shared/inversify';
import { PluginDeployerHandler, PluginType } from '@theia/plugin-ext';

@injectable()
export class VsxRemoteCli implements RemoteCliContribution {

    @inject(PluginDeployerHandler)
    protected readonly pluginDeployerHandler: PluginDeployerHandler;

    async enhanceArgs(context: RemoteCliContext): Promise<string[]> {
        const deployedPlugins = await this.pluginDeployerHandler.getDeployedPlugins();
        // Plugin IDs can be duplicated between frontend and backend plugins, so we create a set first
        const installPluginArgs = Array.from(
            new Set(
                deployedPlugins
                    .filter(plugin => plugin.type === PluginType.User)
                    .map(p => `--install-plugin=${p.metadata.model.id}`)
            )
        );
        return installPluginArgs;
    }
}
