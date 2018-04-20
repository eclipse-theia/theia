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
import { PluginPackage, PluginMetadata } from '../common/plugin-protocol';
import { MetadataScanner } from './metadata-scanner';

@injectable()
export class HostedPluginReader implements BackendApplicationContribution {
    @inject(MetadataScanner) private readonly scanner: MetadataScanner;
    private plugin: PluginMetadata | undefined;
    private pluginPath: string;

    initialize(): void {
        if (process.env.HOSTED_PLUGIN) {
            let pluginPath = process.env.HOSTED_PLUGIN;
            if (pluginPath) {
                if (!pluginPath.endsWith('/')) {
                    pluginPath += '/';
                }
                this.pluginPath = pluginPath;
                this.handlePlugin(pluginPath);
            }
        }
    }

    configure(app: express.Application): void {
        app.get('/hostedPlugin/:path(*)', (req, res) => {
            const filePath: string = req.params.path;
            res.sendFile(this.pluginPath + filePath);
        });
    }

    private handlePlugin(path: string): void {
        if (!path.endsWith('/')) {
            path += '/';
        }
        const packageJsonPath = path + 'package.json';
        if (fs.existsSync(packageJsonPath)) {
            const plugin: PluginPackage = require(packageJsonPath);
            this.plugin = this.scanner.getPluginMetadata(plugin);

            if (this.plugin.model.entryPoint.backend) {
                this.plugin.model.entryPoint.backend = resolve(path, this.plugin.model.entryPoint.backend);
            }
        } else {
            this.plugin = undefined;
        }
    }

    getPlugin(): PluginMetadata | undefined {
        return this.plugin;
    }
}
