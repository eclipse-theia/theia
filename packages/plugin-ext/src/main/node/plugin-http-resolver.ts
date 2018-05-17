/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as url from "url";
import * as request from "request";

import { PluginDeployerResolver, PluginDeployerResolverContext } from "../../common";

/**
 * Resolver that handle the http(s): protocol
 * http://path/to/my.plugin
 * https://path/to/my.plugin
 */
@injectable()
export class HttpPluginDeployerResolver implements PluginDeployerResolver {

    private unpackedFolder: string;

    constructor() {
        this.unpackedFolder = path.resolve(os.tmpdir(), 'http-remote');
        if (!fs.existsSync(this.unpackedFolder)) {
            fs.mkdirSync(this.unpackedFolder);
        }
    }

    /**
     * Grab the remote file specified by the given URL
     */
    async resolve(pluginResolverContext: PluginDeployerResolverContext): Promise<void> {

        // download the file
        return new Promise<void>((resolve, reject) => {

            // keep filename of the url
            const urlPath = pluginResolverContext.getOriginId();
            const link = url.parse(urlPath);
            if (!link.pathname) {
                reject('invalid link URI' + urlPath);
                return;
            }

            const dirname = path.dirname(link.pathname);
            const basename = path.basename(link.pathname);
            const filename = dirname.replace(/\W/g, '_') + ('-') + basename;
            const unpackedPath = path.resolve(this.unpackedFolder, path.basename(filename));

            const finish = () => {
                pluginResolverContext.addPlugin(pluginResolverContext.getOriginId(), unpackedPath);
                resolve();
            };

            // use of cache. If file is already there use it directly
            if (fs.existsSync(unpackedPath)) {
                finish();
                return;
            }
            const dest = fs.createWriteStream(unpackedPath);

            dest.addListener('finish', finish);
            request.get(pluginResolverContext.getOriginId())
                .on('error', (err) => {
                    reject(err);
                }).pipe(dest);
        });

    }

    /**
     * Handle only the plugins that starts with http or https:
     */
    accept(pluginId: string): boolean {
        return /^http[s]?:\/\/.*$/gm.test(pluginId);
    }
}
