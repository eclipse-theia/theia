/********************************************************************************
 * Copyright (C) 2020 TypeFox and others.
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

import * as os from 'os';
import * as path from 'path';
import * as fs from '@theia/core/shared/fs-extra';
import { v4 as uuidv4 } from 'uuid';
import * as requestretry from 'requestretry';
import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { PluginDeployerResolver, PluginDeployerResolverContext } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { VSXExtensionUri } from '../common/vsx-extension-uri';
import { OVSXClientProvider } from '../common/ovsx-client-provider';

@injectable()
export class VSXExtensionResolver implements PluginDeployerResolver {

    @inject(OVSXClientProvider)
    protected clientProvider: OVSXClientProvider;

    protected readonly downloadPath: string;

    constructor() {
        this.downloadPath = path.resolve(os.tmpdir(), uuidv4());
        fs.ensureDirSync(this.downloadPath);
        fs.emptyDirSync(this.downloadPath);
    }

    accept(pluginId: string): boolean {
        return !!VSXExtensionUri.toId(new URI(pluginId));
    }

    async resolve(context: PluginDeployerResolverContext): Promise<void> {
        const id = VSXExtensionUri.toId(new URI(context.getOriginId()));
        if (!id) {
            return;
        }
        console.log(`[${id}]: trying to resolve latest version...`);
        const client = await this.clientProvider();
        const extension = await client.getLatestCompatibleExtensionVersion(id);
        if (!extension) {
            return;
        }
        if (extension.error) {
            throw new Error(extension.error);
        }
        const resolvedId = id + '-' + extension.version;
        const downloadUrl = extension.files.download;
        console.log(`[${id}]: resolved to '${resolvedId}'`);

        const extensionPath = path.resolve(this.downloadPath, path.basename(downloadUrl));
        console.log(`[${resolvedId}]: trying to download from "${downloadUrl}"...`);
        if (!await this.download(downloadUrl, extensionPath)) {
            console.log(`[${resolvedId}]: not found`);
            return;
        }
        console.log(`[${resolvedId}]: downloaded to ${extensionPath}"`);
        context.addPlugin(resolvedId, extensionPath);
    }

    protected async download(downloadUrl: string, downloadPath: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            requestretry(downloadUrl, {
                method: 'GET',
                maxAttempts: 5,
                retryDelay: 2000,
                retryStrategy: requestretry.RetryStrategies.HTTPOrNetworkError
            }, (err, response) => {
                if (err) {
                    reject(err);
                } else if (response && response.statusCode === 404) {
                    resolve(false);
                } else if (response && response.statusCode !== 200) {
                    reject(new Error(response.statusMessage));
                }
            }).pipe(fs.createWriteStream(downloadPath))
                .on('error', reject)
                .on('close', () => resolve(true));
        });
    }
}
