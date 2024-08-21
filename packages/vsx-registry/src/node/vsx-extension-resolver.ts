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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as path from 'path';
import * as semver from 'semver';
import * as fs from '@theia/core/shared/fs-extra';
import { injectable, inject } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { PluginDeployerHandler, PluginDeployerResolver, PluginDeployerResolverContext, PluginDeployOptions, PluginIdentifiers } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { FileUri } from '@theia/core/lib/node';
import { VSCodeExtensionUri } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-uri';
import { OVSXClientProvider } from '../common/ovsx-client-provider';
import { OVSXApiFilterProvider, VSXExtensionRaw, VSXTargetPlatform } from '@theia/ovsx-client';
import { RequestService } from '@theia/core/shared/@theia/request';
import { PluginVSCodeEnvironment } from '@theia/plugin-ext-vscode/lib/common/plugin-vscode-environment';
import { PluginUninstallationManager } from '@theia/plugin-ext/lib/main/node/plugin-uninstallation-manager';

@injectable()
export class VSXExtensionResolver implements PluginDeployerResolver {

    @inject(OVSXClientProvider) protected clientProvider: OVSXClientProvider;
    @inject(PluginDeployerHandler) protected pluginDeployerHandler: PluginDeployerHandler;
    @inject(RequestService) protected requestService: RequestService;
    @inject(PluginVSCodeEnvironment) protected readonly environment: PluginVSCodeEnvironment;
    @inject(PluginUninstallationManager) protected readonly uninstallationManager: PluginUninstallationManager;
    @inject(OVSXApiFilterProvider) protected vsxApiFilter: OVSXApiFilterProvider;

    accept(pluginId: string): boolean {
        return !!VSCodeExtensionUri.toId(new URI(pluginId));
    }

    static readonly TEMP_DIR_PREFIX = 'vscode-download';
    static readonly TARGET_PLATFORM = `${process.platform}-${process.arch}` as VSXTargetPlatform;

    async resolve(context: PluginDeployerResolverContext, options?: PluginDeployOptions): Promise<void> {
        const id = VSCodeExtensionUri.toId(new URI(context.getOriginId()));
        if (!id) {
            return;
        }
        let extension: VSXExtensionRaw | undefined;
        const filter = await this.vsxApiFilter();
        const version = options?.version || id.version;
        if (version) {
            console.log(`[${id.id}]: trying to resolve version ${version}...`);
            extension = await filter.findLatestCompatibleExtension({
                extensionId: id.id,
                extensionVersion: version,
                includeAllVersions: true,
                targetPlatform: VSXExtensionResolver.TARGET_PLATFORM
            });
        } else {
            console.log(`[${id.id}]: trying to resolve latest version...`);
            extension = await filter.findLatestCompatibleExtension({
                extensionId: id.id,
                includeAllVersions: true,
                targetPlatform: VSXExtensionResolver.TARGET_PLATFORM
            });
        }
        if (!extension) {
            return;
        }
        if (extension.error) {
            throw new Error(extension.error);
        }
        const resolvedId = id.id + '-' + extension.version;
        const downloadUrl = extension.files.download;
        console.log(`[${id.id}]: resolved to '${resolvedId}'`);

        if (!options?.ignoreOtherVersions) {
            const existingVersion = this.hasSameOrNewerVersion(id.id, extension);
            if (existingVersion) {
                console.log(`[${id.id}]: is already installed with the same or newer version '${existingVersion}'`);
                return;
            }
        }
        const downloadDir = await this.getTempDir();
        await fs.ensureDir(downloadDir);
        const downloadedExtensionPath = path.resolve(downloadDir, path.basename(downloadUrl));
        console.log(`[${resolvedId}]: trying to download from "${downloadUrl}"...`, 'to path', downloadDir);
        if (!await this.download(downloadUrl, downloadedExtensionPath)) {
            console.log(`[${resolvedId}]: not found`);
            return;
        }
        console.log(`[${resolvedId}]: downloaded to ${downloadedExtensionPath}"`);
        context.addPlugin(resolvedId, downloadedExtensionPath);
    }

    protected async getTempDir(): Promise<string> {
        const tempDir = FileUri.fsPath(await this.environment.getTempDirUri(VSXExtensionResolver.TEMP_DIR_PREFIX));
        if (!await fs.pathExists(tempDir)) {
            await fs.mkdirs(tempDir);
        }
        return tempDir;
    }

    protected hasSameOrNewerVersion(id: string, extension: VSXExtensionRaw): string | undefined {
        const existingPlugins = this.pluginDeployerHandler.getDeployedPluginsById(id)
            .filter(plugin => !this.uninstallationManager.isUninstalled(PluginIdentifiers.componentsToVersionedId(plugin.metadata.model)));
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
