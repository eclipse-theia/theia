/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { inject, injectable } from "inversify";
import * as express from 'express';
import * as fs from 'fs';
import { resolve } from 'path';
import { MetadataScanner } from './metadata-scanner';
import { PluginMetadata, PluginPackage, getPluginId } from '../../common/plugin-protocol';
import { ILogger } from '@theia/core';

@injectable()
export class HostedPluginReader implements BackendApplicationContribution {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(MetadataScanner) private readonly scanner: MetadataScanner;
    private plugin: PluginMetadata | undefined;

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

        const plugin: PluginPackage = require(packageJsonPath);
        const pluginMetadata = this.scanner.getPluginMetadata(plugin);
        if (pluginMetadata.model.entryPoint.backend) {
            pluginMetadata.model.entryPoint.backend = resolve(path, pluginMetadata.model.entryPoint.backend);
        }

        if (pluginMetadata) {
            this.pluginsIdsFiles.set(getPluginId(pluginMetadata.model), path);
        }

        return pluginMetadata;
    }

    getPlugin(): PluginMetadata | undefined {
        return this.plugin;
    }

}
