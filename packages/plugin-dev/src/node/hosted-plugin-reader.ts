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

import { inject, injectable } from 'inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { HostedPluginReader as PluginReaderHosted } from '@theia/plugin-ext/lib/hosted/node/plugin-reader';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { PluginMetadata } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { PluginDeployerEntryImpl } from '@theia/plugin-ext/lib/main/node/plugin-deployer-entry-impl';
import { HostedPluginDeployerHandler } from '@theia/plugin-ext/lib/hosted/node/hosted-plugin-deployer-handler';

@injectable()
export class HostedPluginReader implements BackendApplicationContribution {

    @inject(PluginReaderHosted)
    protected pluginReader: PluginReaderHosted;

    private readonly hostedPlugin = new Deferred<PluginMetadata | undefined>();

    @inject(HostedPluginDeployerHandler)
    protected deployerHandler: HostedPluginDeployerHandler;

    async initialize() {
        this.pluginReader.doGetPluginMetadata(process.env.HOSTED_PLUGIN)
            .then(this.hostedPlugin.resolve.bind(this.hostedPlugin));

        const pluginPath = process.env.HOSTED_PLUGIN;
        if (pluginPath) {
            const hostedPlugin = new PluginDeployerEntryImpl('Hosted Plugin', pluginPath!, pluginPath);
            const hostedMetadata = await this.hostedPlugin.promise;
            if (hostedMetadata!.model.entryPoint && hostedMetadata!.model.entryPoint.backend) {
                this.deployerHandler.deployBackendPlugins([hostedPlugin]);
            }

            if (hostedMetadata!.model.entryPoint && hostedMetadata!.model.entryPoint.frontend) {
                this.deployerHandler.deployFrontendPlugins([hostedPlugin]);
            }
        }
    }

    async getPlugin(): Promise<PluginMetadata | undefined> {
        return this.hostedPlugin.promise;
    }
}
