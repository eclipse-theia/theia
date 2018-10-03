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

import { PluginDeployerResolver, PluginDeployerResolverContext } from '@theia/plugin-ext';
import { injectable } from 'inversify';
import * as request from 'request';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Resolver that handle the vscode: protocol
 */
@injectable()
export class VsCodePluginDeployerResolver implements PluginDeployerResolver {

    private static PREFIX = 'vscode:extension/';

    private static MARKET_PLACE_ENDPOINT = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';

    private static HEADERS = {
        'Content-Type': 'application/json',
        'Accept': 'application/json;api-version=3.0-preview.1'
    };

    private unpackedFolder: string;
    constructor() {
        this.unpackedFolder = path.resolve(os.tmpdir(), 'vscode-extension-marketplace');
        if (!fs.existsSync(this.unpackedFolder)) {
            fs.mkdirSync(this.unpackedFolder);
        }
    }

    /**
     * Download vscode extensions if available and add them as plugins.
     */
    async resolve(pluginResolverContext: PluginDeployerResolverContext): Promise<void> {

        // download the file
        return new Promise<void>((resolve, reject) => {
            // extract name
            const extracted = /^vscode:extension\/(.*)/gm.exec(pluginResolverContext.getOriginId());

            if (!extracted || extracted === null) {
                reject('Invalid extension' + pluginResolverContext.getOriginId());
                return;
            }
            const extensionName = extracted[1];
            const wantedExtensionVersion = undefined;

            const json = {
                'filters': [{
                    'criteria': [{ 'filterType': 7, 'value': extensionName }], 'pageNumber': 1,
                    'pageSize': 1, 'sortBy': 0, 'sortOrder': 0
                }], 'assetTypes': ['Microsoft.VisualStudio.Services.VSIXPackage'],
                'flags': 131
            };

            const options = {
                url: VsCodePluginDeployerResolver.MARKET_PLACE_ENDPOINT,
                headers: VsCodePluginDeployerResolver.HEADERS,
                method: 'POST',
                json: json
            };

            request(options, (error, response, body) => {
                if (error) {
                    reject(error);
                } else if (response.statusCode === 200) {
                    const extension = body.results[0].extensions[0];
                    if (!extension) {
                        reject('No extension');
                    }
                    let asset;
                    if (wantedExtensionVersion !== undefined) {
                        const extensionVersion = extension.versions.filter((value: any) => value.version === wantedExtensionVersion)[0];
                        asset = extensionVersion.files.filter((f: any) => f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage')[0];
                    } else {
                        // take first one
                        asset = extension.versions[0].files.filter((f: any) => f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage')[0];
                    }
                    const shortName = pluginResolverContext.getOriginId().replace(/\W/g, '_');
                    const unpackedPath = path.resolve(this.unpackedFolder, path.basename(shortName + '.vsix'));
                    const finish = () => {
                        pluginResolverContext.addPlugin(pluginResolverContext.getOriginId(), unpackedPath);
                        resolve();
                    };

                    const dest = fs.createWriteStream(unpackedPath);
                    dest.addListener('finish', finish);

                    request.get(asset.source)
                        .on('error', err => {
                            reject(err);
                        }).pipe(dest);
                } else {
                    reject(new Error('Invalid status code' + response.statusCode + ' and message is ' + response.statusMessage));
                }
            });
        });

    }

    /**
     * Handle only the plugins that starts with vscode:
     */
    accept(pluginId: string): boolean {
        return pluginId.startsWith(VsCodePluginDeployerResolver.PREFIX);
    }
}
