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

import { injectable, inject } from 'inversify';
import { IConfiguration } from '../node/cotributions/contributions';
import { Emitter, DisposableCollection, ILogger } from "@theia/core/lib/common";

 @injectable()
 export class PluginConfigurationProvider {

    private pluginConfigs: Map<String, IConfiguration>;
    private combinedPluginSchema: IConfiguration = {properties: {}};

    protected readonly toDispose = new DisposableCollection();
    protected readonly onPluginConfigurationChangedEmmiter = new Emitter<IConfiguration>();
    readonly onPluginConfigurationChanged = this.onPluginConfigurationChangedEmmiter.event;

    // todo subscript to stop plugin.... to clean up
    constructor(
         @inject(ILogger) protected readonly logger: ILogger,
    ) {
        this.pluginConfigs = new Map<String, IConfiguration>();
    }

    applyPluginConfig(pluginId: string, configuration: IConfiguration) {
        if (pluginId) {
            this.pluginConfigs.set(pluginId, configuration);
        }
        this.updateConsolidatedConfig();
    }

    removePluginConfig(pluginId: string) {
        if (pluginId) {
            this.pluginConfigs.delete(pluginId);
        }
        this.updateConsolidatedConfig();
    }

    getPluginConfig(pluginId: string): IConfiguration | undefined {
        return this.pluginConfigs.get(pluginId);
    }

    private updateConsolidatedConfig(force?: boolean): void {
        if (force) {
            this.combinedPluginSchema = {properties: {}};
        }

        this.pluginConfigs.forEach((config, pluginId) => {
            for (const property in config.properties) {
                if (this.combinedPluginSchema.properties[property]) {
                    this.logger.error(`Preference name from plugin ${pluginId} can not be applied. Collision detected in the config for property: ${property}`);
                } else {
                    this.combinedPluginSchema.properties[property] = config.properties[property];
                }
            }
        });

        this.onPluginConfigurationChangedEmmiter.fire(this.combinedPluginSchema);
    }

    // Return consolidated plugins config.
    getConsolidatedConfig(): IConfiguration {
        console.log(this.combinedPluginSchema);
        return this.combinedPluginSchema;
    }
 }
