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
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { inject, injectable, optional, multiInject } from 'inversify';
import * as express from 'express';
import * as fs from 'fs';
import { resolve } from 'path';
import { MetadataScanner } from './metadata-scanner';
import { PluginMetadata, PluginPackage, getPluginId, MetadataProcessor } from '../../common/plugin-protocol';
import { ILogger } from '@theia/core';

@injectable()
export class HostedPluginReader implements BackendApplicationContribution {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(MetadataScanner) private readonly scanner: MetadataScanner;
    private plugin: PluginMetadata | undefined;

    @optional()
    @multiInject(MetadataProcessor) private readonly metadataProcessors: MetadataProcessor[];

    /**
     * Map between a plugin's id and the local storage
     */
    private pluginsIdsFiles: Map<string, string> = new Map();

    initialize(): void {
        if (process.env.HOSTED_PLUGIN) {
            let pluginPath = process.env.HOSTED_PLUGIN;
            if (pluginPath) {
                if (!pluginPath.endsWith('/')) {
                    pluginPath += '/';
                }
                this.plugin = this.getPluginMetadata(pluginPath);
            }
        }
    }

    configure(app: express.Application): void {
        app.get('/hostedPlugin/:pluginId/:path(*)', (req, res) => {
            const pluginId = req.params.pluginId;
            const filePath: string = req.params.path;

            const localPath: string | undefined = this.pluginsIdsFiles.get(pluginId);
            if (localPath) {
                const fileToServe = localPath + filePath;
                res.sendFile(fileToServe);
            } else {
                res.status(404).send("The plugin with id '" + pluginId + "' does not exist.");
            }
        });
    }

    public getPluginMetadata(path: string): PluginMetadata | undefined {
        if (!path.endsWith('/')) {
            path += '/';
        }
        const packageJsonPath = path + 'package.json';
        if (!fs.existsSync(packageJsonPath)) {
            return undefined;
        }

        let rawData = fs.readFileSync(packageJsonPath).toString();
        rawData = this.localize(rawData, path);

        const plugin: PluginPackage = JSON.parse(rawData);
        plugin.packagePath = path;
        const pluginMetadata = this.scanner.getPluginMetadata(plugin);
        if (pluginMetadata.model.entryPoint.backend) {
            pluginMetadata.model.entryPoint.backend = resolve(path, pluginMetadata.model.entryPoint.backend);
        }

        if (pluginMetadata) {
            // Add post processor
            if (this.metadataProcessors) {
                this.metadataProcessors.forEach(metadataProcessor => {
                    metadataProcessor.process(pluginMetadata);
                });
            }
            this.pluginsIdsFiles.set(getPluginId(pluginMetadata.model), path);
        }

        return pluginMetadata;
    }

    private localize(rawData: string, pluginPath: string): string {
        const nlsPath = pluginPath + 'package.nls.json';
        if (fs.existsSync(nlsPath)) {
            const nlsMap: {
                [key: string]: string
            } = require(nlsPath);
            for (const key of Object.keys(nlsMap)) {
                const value = nlsMap[key].replace(/\"/g, '\\"');
                rawData = rawData.split('%' + key + '%').join(value);
            }
        }

        return rawData;
    }

    getPlugin(): PluginMetadata | undefined {
        return this.plugin;
    }

}
