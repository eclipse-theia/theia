/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { injectable } from "inversify";
import * as express from 'express';
import * as fs from 'fs';
import { Plugin } from '../common/plugin-protocol';
import { resolve } from 'path';

@injectable()
export class HostedPluginReader implements BackendApplicationContribution {
    private plugin: Plugin | undefined;
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
            const plugin: Plugin = require(packageJsonPath);
            this.plugin = plugin;
            if (plugin.theiaPlugin.node) {
                plugin.theiaPlugin.node = resolve(path, plugin.theiaPlugin.node);
            }
        } else {
            this.plugin = undefined;
        }
    }

    getPlugin(): Plugin | undefined {
        return this.plugin;
    }
}
