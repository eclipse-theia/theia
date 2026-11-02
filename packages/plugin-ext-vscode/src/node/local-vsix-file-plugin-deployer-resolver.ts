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

import * as path from 'path';
import { inject, injectable, named } from '@theia/core/shared/inversify';
import { DuplicateExtensionError, PluginDeployerHandler, PluginDeployerResolverContext, PluginDeployOptions, PluginIdentifiers, PluginType } from '@theia/plugin-ext';
import { LocalPluginDeployerResolver } from '@theia/plugin-ext/lib/main/node/resolvers/local-plugin-deployer-resolver';
import { PluginUninstallationManager } from '@theia/plugin-ext/lib/main/node/plugin-uninstallation-manager';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { isVSCodePluginFile } from './plugin-vscode-file-handler';
import { existsInDeploymentDir, replaceInDeploymentDir, unpackToDeploymentDir, extractExtensionIdentityFromVsix } from './plugin-vscode-utils';
import { ILogger } from '@theia/core';

@injectable()
export class LocalVSIXFilePluginDeployerResolver extends LocalPluginDeployerResolver {
    static LOCAL_FILE = 'local-file';
    static FILE_EXTENSION = '.vsix';

    @inject(PluginVSCodeEnvironment) protected readonly environment: PluginVSCodeEnvironment;
    @inject(PluginDeployerHandler) protected readonly pluginDeployerHandler: PluginDeployerHandler;
    @inject(PluginUninstallationManager) protected readonly uninstallationManager: PluginUninstallationManager;

    @inject(ILogger) @named('plugin-ext-vscode:LocalVSIXFilePluginDeployerResolver')
    protected override readonly logger: ILogger;

    protected get supportedScheme(): string {
        return LocalVSIXFilePluginDeployerResolver.LOCAL_FILE;
    }

    override accept(pluginId: string): boolean {
        return super.accept(pluginId) && isVSCodePluginFile(pluginId);
    }

    async resolveFromLocalPath(pluginResolverContext: PluginDeployerResolverContext, localPath: string, options?: PluginDeployOptions): Promise<void> {
        // Extract the true extension identity from the VSIX package.json
        // This prevents duplicate installations when the same extension is installed from VSIX files with different filenames
        // See: https://github.com/eclipse-theia/theia/issues/16845
        const components = await extractExtensionIdentityFromVsix(localPath);

        if (!components) {
            // Fallback to filename-based ID if package.json cannot be read
            // This maintains backward compatibility for edge cases
            const fallbackId = path.basename(localPath, LocalVSIXFilePluginDeployerResolver.FILE_EXTENSION);
            this.logger.warn(`[${pluginResolverContext.getOriginId()}]: Could not read extension identity from VSIX, falling back to filename: ${fallbackId}`);

            if (await existsInDeploymentDir(this.environment, fallbackId)) {
                this.logger.info(`[${pluginResolverContext.getOriginId()}]: Target dir already exists in plugin deployment dir`);
                return;
            }

            const fallbackDeploymentDir = await unpackToDeploymentDir(this.environment, localPath, fallbackId);
            pluginResolverContext.addPlugin(fallbackId, fallbackDeploymentDir);
            return;
        }

        const versionedId = PluginIdentifiers.componentsToVersionedId(components);
        const unversionedId = PluginIdentifiers.componentsToUnversionedId(components);
        const { version } = components;

        // Check if the deployment directory already exists on disk
        const existsOnDisk = await existsInDeploymentDir(this.environment, versionedId);
        if (options?.ifInstalled !== 'replace') {
            const installedVersion = existsOnDisk ? version : options?.ifInstalled === 'fail' ? this.findInstalledVersion(unversionedId) : undefined;
            if (installedVersion) {
                throw DuplicateExtensionError.create(
                    `Extension ${unversionedId} is already installed (version: ${installedVersion}).`,
                    { id: unversionedId, installedVersion, version }
                );
            }
        }

        // The handler skips IDs that it knows and would keep the old metadata, so a redeploy of this version always needs an undeploy.
        // The handler also keeps that metadata for a version that it uninstalled, for example after an upgrade, although the directory is gone.
        // Other versions need no removal here: the handler uninstalls them when it deploys this one.
        let extensionDeploymentDir: string;
        if (existsOnDisk) {
            extensionDeploymentDir = await replaceInDeploymentDir(this.environment, localPath, versionedId, () => this.pluginDeployerHandler.undeployPlugin(versionedId));
        } else {
            await this.pluginDeployerHandler.undeployPlugin(versionedId);
            extensionDeploymentDir = await unpackToDeploymentDir(this.environment, localPath, versionedId);
        }
        pluginResolverContext.addPlugin(versionedId, extensionDeploymentDir);
    }

    /**
     * @returns the version of a deployed user extension. Ignores built-in extensions and extensions that are uninstalled and wait for a restart.
     */
    protected findInstalledVersion(unversionedId: PluginIdentifiers.UnversionedId): string | undefined {
        return this.pluginDeployerHandler.getDeployedPluginsById(unversionedId)
            .find(plugin => plugin.type === PluginType.User && !this.uninstallationManager.isUninstalled(PluginIdentifiers.componentsToVersionedId(plugin.metadata.model)))
            ?.metadata.model.version;
    }
}
