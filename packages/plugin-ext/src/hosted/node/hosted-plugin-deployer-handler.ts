/********************************************************************************
 * Copyright (C) 2019 RedHat and others.
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
import { ILogger } from '@theia/core';
import { PluginDeployerHandler, PluginDeployerEntry, PluginMetadata } from '../../common/plugin-protocol';
import { HostedPluginReader } from './plugin-reader';

@injectable()
export class HostedPluginDeployerHandler implements PluginDeployerHandler {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(HostedPluginReader)
    private readonly reader: HostedPluginReader;

    /**
     * Managed plugin metadata backend entries.
     */
    private readonly currentBackendPluginsMetadata: PluginMetadata[] = [];

    /**
     * Managed plugin metadata frontend entries.
     */
    private readonly currentFrontendPluginsMetadata: PluginMetadata[] = [];

    getDeployedFrontendMetadata(): PluginMetadata[] {
        return this.currentFrontendPluginsMetadata;
    }

    getDeployedBackendMetadata(): PluginMetadata[] {
        return this.currentBackendPluginsMetadata;
    }

    async deployFrontendPlugins(frontendPlugins: PluginDeployerEntry[]): Promise<void> {
        for (const plugin of frontendPlugins) {
            const metadata = await this.reader.getPluginMetadata(plugin.path());
            if (metadata) {
                this.currentFrontendPluginsMetadata.push(metadata);
                this.logger.info(`Deploying frontend plugin "${metadata.model.name}@${metadata.model.version}" from "${metadata.model.entryPoint.frontend || plugin.path()}"`);
            }
        }
    }

    async deployBackendPlugins(backendPlugins: PluginDeployerEntry[]): Promise<void> {
        for (const plugin of backendPlugins) {
            const metadata = await this.reader.getPluginMetadata(plugin.path());
            if (metadata) {
                this.currentBackendPluginsMetadata.push(metadata);
                this.logger.info(`Deploying backend plugin "${metadata.model.name}@${metadata.model.version}" from "${metadata.model.entryPoint.backend || plugin.path()}"`);
            }
        }
    }

}
