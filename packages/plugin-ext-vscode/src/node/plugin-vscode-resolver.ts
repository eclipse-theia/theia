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

    private static PREFIX_VSCODE_EXTENSION = 'vscode:extension/';

    private static PREFIX_EXT_INSTALL = 'ext install ';

    private static MARKET_PLACE_ENDPOINT = 'https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery';

    private static HEADERS = {
        'Content-Type': 'application/json',
        'Accept': 'application/json;api-version=3.0-preview.1'
    };

    private vscodeExtensionsFolder: string;
    constructor() {
        this.vscodeExtensionsFolder = process.env.VSCODE_PLUGINS || path.resolve(os.tmpdir(), 'vscode-extension-marketplace');
        if (!fs.existsSync(this.vscodeExtensionsFolder)) {
            fs.mkdirSync(this.vscodeExtensionsFolder);
        }
    }

    /**
     * Download vscode extensions if available and add them as plugins.
     */
    async resolve(pluginResolverContext: PluginDeployerResolverContext): Promise<void> {

        // download the file
        return new Promise<void>((resolve, reject) => {
            const originId = pluginResolverContext.getOriginId();

            let extensionName = '';
            if (originId.startsWith(VsCodePluginDeployerResolver.PREFIX_VSCODE_EXTENSION)) {
                extensionName = originId.substring(VsCodePluginDeployerResolver.PREFIX_VSCODE_EXTENSION.length);
            } else if (originId.startsWith(VsCodePluginDeployerResolver.PREFIX_EXT_INSTALL)) {
                extensionName = originId.substring(VsCodePluginDeployerResolver.PREFIX_EXT_INSTALL.length);
            }

            if (!extensionName) {
                reject(new Error('Invalid extension' + originId));
                return;
            }

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
                    return;
                } else if (response.statusCode === 200) {
                    const extension = body.results[0].extensions[0];
                    if (!extension) {
                        reject(new Error('No extension'));
                        return;
                    }
                    let asset;
                    if (wantedExtensionVersion !== undefined) {
                        const extensionVersion = extension.versions.filter((value: any) => value.version === wantedExtensionVersion)[0];
                        asset = extensionVersion.files.filter((f: any) => f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage')[0];
                    } else {
                        // take first one
                        asset = extension.versions[0].files.filter((f: any) => f.assetType === 'Microsoft.VisualStudio.Services.VSIXPackage')[0];
                    }

                    const shortName = extensionName.replace(/\W/g, '_');
                    const extensionPath = path.resolve(this.vscodeExtensionsFolder, path.basename(shortName + '.vsix'));
                    const finish = () => {
                        pluginResolverContext.addPlugin(originId, extensionPath);
                        resolve();
                    };

                    const dest = fs.createWriteStream(extensionPath);
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
        return pluginId.startsWith(VsCodePluginDeployerResolver.PREFIX_VSCODE_EXTENSION) ||
            pluginId.startsWith(VsCodePluginDeployerResolver.PREFIX_EXT_INSTALL);
    }
}
