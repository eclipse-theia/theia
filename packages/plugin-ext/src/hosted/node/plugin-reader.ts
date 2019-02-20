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

// tslint:disable:no-any

import * as path from 'path';
import * as fs from 'fs-extra';
import * as express from 'express';
import { ILogger } from '@theia/core';
import { inject, injectable, optional, multiInject } from 'inversify';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
import { PluginMetadata, getPluginId, MetadataProcessor } from '../../common/plugin-protocol';
import { MetadataScanner } from './metadata-scanner';

@injectable()
export class HostedPluginReader implements BackendApplicationContribution {

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(MetadataScanner)
    private readonly scanner: MetadataScanner;

    private readonly hostedPlugin = new Deferred<PluginMetadata | undefined>();

    @optional()
    @multiInject(MetadataProcessor) private readonly metadataProcessors: MetadataProcessor[];

    /**
     * Map between a plugin's id and the local storage
     */
    private pluginsIdsFiles: Map<string, string> = new Map();

    initialize(): void {
        this.doGetPluginMetadata(process.env.HOSTED_PLUGIN)
            .then(this.hostedPlugin.resolve.bind(this.hostedPlugin));
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

    async getPluginMetadata(pluginPath: string): Promise<PluginMetadata | undefined> {
        const plugin = await this.doGetPluginMetadata(pluginPath);
        if (plugin) {
            const hostedPlugin = await this.getPlugin();
            if (hostedPlugin && hostedPlugin.model.name === plugin.model.name) {
                // prefer hosted plugin
                return undefined;
            }
        }
        return plugin;
    }

    /**
     * MUST never throw to isolate plugin deployment
     */
    protected async doGetPluginMetadata(pluginPath: string | undefined) {
        try {
            if (!pluginPath) {
                return undefined;
            }
            if (!pluginPath.endsWith('/')) {
                pluginPath += '/';
            }
            return await this.loadPluginMetadata(pluginPath);
        } catch (e) {
            this.logger.error(`Failed to load plugin metadata from "${pluginPath}"`, e);
            return undefined;
        }
    }

    protected async loadPluginMetadata(pluginPath: string): Promise<PluginMetadata | undefined> {
        const manifest = await this.loadManifest(pluginPath);
        if (!manifest) {
            return undefined;
        }
        manifest.packagePath = pluginPath;
        const pluginMetadata = this.scanner.getPluginMetadata(manifest);
        if (pluginMetadata.model.entryPoint.backend) {
            pluginMetadata.model.entryPoint.backend = path.resolve(pluginPath, pluginMetadata.model.entryPoint.backend);
        }
        if (pluginMetadata) {
            // Add post processor
            if (this.metadataProcessors) {
                this.metadataProcessors.forEach(metadataProcessor => {
                    metadataProcessor.process(pluginMetadata);
                });
            }
            this.pluginsIdsFiles.set(getPluginId(pluginMetadata.model), pluginPath);
        }
        return pluginMetadata;
    }

    async getPlugin(): Promise<PluginMetadata | undefined> {
        return this.hostedPlugin.promise;
    }

    protected async loadManifest(pluginPath: string): Promise<any> {
        const [manifest, translations] = await Promise.all([
            fs.readJson(path.join(pluginPath, 'package.json')),
            this.loadTranslations(pluginPath)
        ]);
        return manifest && translations && Object.keys(translations).length ?
            this.localize(manifest, translations) :
            manifest;
    }

    protected async loadTranslations(pluginPath: string): Promise<any> {
        try {
            return await fs.readJson(path.join(pluginPath, 'package.nls.json'));
        } catch (e) {
            if (e.code !== 'ENOENT') {
                throw e;
            }
            return {};
        }
    }

    protected localize(value: any, translations: {
        [key: string]: string
    }): any {
        if (typeof value === 'string') {
            const match = HostedPluginReader.NLS_REGEX.exec(value);
            return match && translations[match[1]] || value;
        }
        if (Array.isArray(value)) {
            const result = [];
            for (const item of value) {
                result.push(this.localize(item, translations));
            }
            return result;
        }
        if (value === null) {
            return value;
        }
        if (typeof value === 'object') {
            const result: { [key: string]: any } = {};
            // tslint:disable-next-line:forin
            for (const propertyName in value) {
                result[propertyName] = this.localize(value[propertyName], translations);
            }
            return result;
        }
        return value;
    }

    static NLS_REGEX = /^%([\w\d.-]+)%$/i;

}
