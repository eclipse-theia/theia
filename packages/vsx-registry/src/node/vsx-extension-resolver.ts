// *****************************************************************************
// Copyright (C) 2020 TypeFox and others.
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as os from 'os';
import * as path from 'path';
import * as semver from 'semver';
import * as fs from '@theia/core/shared/fs-extra';
import { v4 as uuidv4 } from 'uuid';
import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { PluginDeployerHandler, PluginDeployerResolver, PluginDeployerResolverContext, PluginDeployOptions } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { VSCodeExtensionUri } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-uri';
import { OVSXClientProvider } from '../common/ovsx-client-provider';
import { VSXExtensionRaw } from '@theia/ovsx-client';
import { RequestService } from '@theia/core/shared/@theia/request';

@injectable()
export class VSXExtensionResolver implements PluginDeployerResolver {

    @inject(OVSXClientProvider)
    protected clientProvider: OVSXClientProvider;

    @inject(PluginDeployerHandler)
    protected pluginDeployerHandler: PluginDeployerHandler;

    @inject(RequestService)
    protected requestService: RequestService;

    protected readonly downloadPath: string;

    constructor() {
        this.downloadPath = path.resolve(os.tmpdir(), uuidv4());
        fs.ensureDirSync(this.downloadPath);
        fs.emptyDirSync(this.downloadPath);
    }

    accept(pluginId: string): boolean {
        return !!VSCodeExtensionUri.toId(new URI(pluginId));
    }

    async resolve(context: PluginDeployerResolverContext, options?: PluginDeployOptions): Promise<void> {
        const id = VSCodeExtensionUri.toId(new URI(context.getOriginId()));
        if (!id) {
            return;
        }
        let extension: VSXExtensionRaw | undefined;
        const client = await this.clientProvider();
        if (options) {
            console.log(`[${id}]: trying to resolve version ${options.version}...`);
            extension = await client.getExtension(id, { extensionVersion: options.version, includeAllVersions: true });
        } else {
            console.log(`[${id}]: trying to resolve latest version...`);
            extension = await client.getLatestCompatibleExtensionVersion(id);
        }
        if (!extension) {
            return;
        }
        if (extension.error) {
            throw new Error(extension.error);
        }
        const resolvedId = id + '-' + extension.version;
        const downloadUrl = extension.files.download;
        console.log(`[${id}]: resolved to '${resolvedId}'`);

        if (!options?.ignoreOtherVersions) {
            const existingVersion = this.hasSameOrNewerVersion(id, extension);
            if (existingVersion) {
                console.log(`[${id}]: is already installed with the same or newer version '${existingVersion}'`);
                return;
            }
        }

        const extensionPath = path.resolve(this.downloadPath, path.basename(downloadUrl));
        console.log(`[${resolvedId}]: trying to download from "${downloadUrl}"...`, 'to path', this.downloadPath);
        if (!await this.download(downloadUrl, extensionPath)) {
            console.log(`[${resolvedId}]: not found`);
            return;
        }
        console.log(`[${resolvedId}]: downloaded to ${extensionPath}"`);
        context.addPlugin(resolvedId, extensionPath);
    }

    protected hasSameOrNewerVersion(id: string, extension: VSXExtensionRaw): string | undefined {
        const existingPlugins = this.pluginDeployerHandler.getDeployedPluginsById(id);
        const sufficientVersion = existingPlugins.find(existingPlugin => {
            const existingVersion = semver.clean(existingPlugin.metadata.model.version);
            const desiredVersion = semver.clean(extension.version);
            if (desiredVersion && existingVersion && semver.gte(existingVersion, desiredVersion)) {
                return existingVersion;
            }
        });
        return sufficientVersion?.metadata.model.version;
    }

    protected async download(downloadUrl: string, downloadPath: string): Promise<boolean> {
        if (await fs.pathExists(downloadPath)) { return true; }
        const context = await this.requestService.request({ url: downloadUrl });
        if (context.res.statusCode === 404) {
            return false;
        } else if (context.res.statusCode !== 200) {
            throw new Error('Request returned status code: ' + context.res.statusCode);
        } else {
            await fs.writeFile(downloadPath, context.buffer);
            return true;
        }
    }
}
