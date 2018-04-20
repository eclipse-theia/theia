/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import * as express from 'express';
import { injectable, inject } from "inversify";
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { HostedPluginServer, HostedPluginClient, PluginMetadata } from '../common/plugin-protocol';
import { HostedPluginReader } from './plugin-reader';
import { HostedPluginSupport } from './hosted-plugin';

const pluginPath = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + './theia/plugins/';

@injectable()
export class PluginApiContribution implements BackendApplicationContribution {
    configure(app: express.Application): void {
        app.get('/plugin/:path(*)', (req, res) => {
            const filePath: string = req.params.path;
            res.sendFile(pluginPath + filePath);
        });
    }
}

@injectable()
export class HostedPluginServerImpl implements HostedPluginServer {

    constructor(@inject(HostedPluginReader) private readonly reader: HostedPluginReader,
        @inject(HostedPluginSupport) private readonly hostedPlugin: HostedPluginSupport) {
    }

    dispose(): void {
        this.hostedPlugin.clientClosed();
    }
    setClient(client: HostedPluginClient): void {
        this.hostedPlugin.setClient(client);
    }
    getHostedPlugin(): Promise<PluginMetadata | undefined> {
        const pluginMetadata = this.reader.getPlugin();
        if (pluginMetadata) {
            this.hostedPlugin.runPlugin(pluginMetadata.model);
        }
        return Promise.resolve(this.reader.getPlugin());
    }

    onMessage(message: string): Promise<void> {
        this.hostedPlugin.onMessage(message);
        return Promise.resolve();
    }
}
