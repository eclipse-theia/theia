/*
 * Copyright (C) 2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
import * as express from 'express';
import { injectable, inject } from "inversify";
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { HostedPluginServer, HostedPluginClient, Plugin } from '../common/plugin-protocol';
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
    getHostedPlugin(): Promise<Plugin | undefined> {
        const ext = this.reader.getPlugin();
        if (ext) {
            this.hostedPlugin.runPlugin(ext);
        }
        return Promise.resolve(this.reader.getPlugin());
    }

    onMessage(message: string): Promise<void> {
        this.hostedPlugin.onMessage(message);
        return Promise.resolve();
    }
}
