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

import * as express from 'express';
import * as compression from 'compression';
import { injectable, inject } from 'inversify';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { PluginServerManager } from '../../hosted/node/plugin-server-manager';
import { HostedPluginServerImpl } from '../../hosted/node/plugin-service';
import { PluginMetadata } from '../../common/plugin-protocol';

const pluginPath = (process.env.HOME || process.env.HOMEPATH || process.env.USERPROFILE) + './theia/plugins/';

@injectable()
export class PluginApiContribution implements BackendApplicationContribution {

    @inject(PluginServerManager)
    protected readonly servers: PluginServerManager;

    configure(app: express.Application): void {
        app.get('/plugin/:path(*)', (req, res) => {
            const filePath: string = req.params.path;
            res.sendFile(pluginPath + filePath);
        });

        app.get('/webview/:path(*)', (req, res) => {
            res.sendFile(FileUri.fsPath('file:/' + req.params.path));
        });

        app.use('/plugins', this.createPluginsRouter());
    }

    protected createPluginsRouter(): express.Router {
        const router = express.Router();
        router.use(compression());
        router.post('/:clientId', this.servePlugins.bind(this));
        return router;
    }

    protected async servePlugins(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
        const { clientId } = req.params;
        if (!(clientId && typeof clientId === 'string')) {
            console.error(`Invalid client id: ${clientId}`);
            res.status(400).send('Invalid client id.');
            return;
        }
        const server = this.servers.get(clientId);
        if (!(server instanceof HostedPluginServerImpl)) {
            console.error(`No plugin server found for '${clientId}' client.`);
            res.status(404).send('No plugin server found.');
            return;
        }
        try {
            const plugins: PluginMetadata[] = [];
            if (Array.isArray(req.body)) {
                for (const pluginId of req.body) {
                    if (typeof pluginId === 'string') {
                        try {
                            const plugin = server.getDeployedPlugin(pluginId);
                            if (plugin) {
                                plugins.push(plugin);
                            }
                        } catch (e) {
                            console.error(`Failed to fetch metadata for '${pluginId}' plugin`, e);
                        }
                    }
                }
            }
            res.json(plugins);
        } catch (e) {
            console.error(`Failed to fetch plugins for '${clientId}' client`, e);
            if (!res.headersSent) {
                res.status(500).send('Failed to fetch plugins.');
            }
        }
    }

}
