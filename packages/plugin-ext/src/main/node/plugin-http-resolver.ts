// *****************************************************************************
// Copyright (C) 2018 Red Hat, Inc. and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { RequestContext, RequestService } from '@theia/core/shared/@theia/request';
import { inject, injectable } from '@theia/core/shared/inversify';
import { promises as fs, existsSync, mkdirSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as url from 'url';
import { PluginDeployerResolver, PluginDeployerResolverContext } from '../../common';

/**
 * Resolver that handle the http(s): protocol
 * http://path/to/my.plugin
 * https://path/to/my.plugin
 */
@injectable()
export class HttpPluginDeployerResolver implements PluginDeployerResolver {

    private unpackedFolder: string;

    @inject(RequestService)
    protected readonly request: RequestService;

    constructor() {
        this.unpackedFolder = path.resolve(os.tmpdir(), 'http-remote');
        if (!existsSync(this.unpackedFolder)) {
            mkdirSync(this.unpackedFolder);
        }
    }

    /**
     * Grab the remote file specified by the given URL
     */
    async resolve(pluginResolverContext: PluginDeployerResolverContext): Promise<void> {

        // download the file
        // keep filename of the url
        const urlPath = pluginResolverContext.getOriginId();
        const link = url.parse(urlPath);
        if (!link.pathname) {
            throw new Error('invalid link URI' + urlPath);
        }

        const dirname = path.dirname(link.pathname);
        const basename = path.basename(link.pathname);
        const filename = dirname.replace(/\W/g, '_') + ('-') + basename;
        const unpackedPath = path.resolve(this.unpackedFolder, path.basename(filename));

        try {
            await fs.access(unpackedPath);
            // use of cache. If file is already there use it directly
            return;
        } catch { }

        const response = await this.request.request({ url: pluginResolverContext.getOriginId() });
        if (RequestContext.isSuccess(response)) {
            await fs.writeFile(unpackedPath, response.buffer);
            pluginResolverContext.addPlugin(pluginResolverContext.getOriginId(), unpackedPath);
        } else {
            throw new Error(`Could not download the plugin from ${pluginResolverContext.getOriginId()}. HTTP status code: ${response.res.statusCode}`);
        }

    }

    /**
     * Handle only the plugins that starts with http or https:
     */
    accept(pluginId: string): boolean {
        return /^http[s]?:\/\/.*$/gm.test(pluginId);
    }
}
