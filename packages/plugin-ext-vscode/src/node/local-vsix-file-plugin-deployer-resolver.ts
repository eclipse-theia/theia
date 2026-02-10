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
import { inject, injectable } from '@theia/core/shared/inversify';
import { PluginDeployerResolverContext, PluginDeployerHandler } from '@theia/plugin-ext/lib/common/plugin-protocol';
import { LocalPluginDeployerResolver } from '@theia/plugin-ext/lib/main/node/resolvers/local-plugin-deployer-resolver';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { isVSCodePluginFile } from './plugin-vscode-file-handler';
import { existsInDeploymentDir, unpackToDeploymentDir, extractExtensionIdentityFromVsix } from './plugin-vscode-utils';

@injectable()
export class LocalVSIXFilePluginDeployerResolver extends LocalPluginDeployerResolver {
    static LOCAL_FILE = 'local-file';
    static FILE_EXTENSION = '.vsix';

    @inject(PluginVSCodeEnvironment) protected readonly environment: PluginVSCodeEnvironment;
    @inject(PluginDeployerHandler) protected readonly pluginDeployerHandler: PluginDeployerHandler;

    protected get supportedScheme(): string {
        return LocalVSIXFilePluginDeployerResolver.LOCAL_FILE;
    }

    override accept(pluginId: string): boolean {
        return super.accept(pluginId) && isVSCodePluginFile(pluginId);
    }

    async resolveFromLocalPath(pluginResolverContext: PluginDeployerResolverContext, localPath: string): Promise<void> {
        // Extract the true extension identity from the VSIX package.json
        // This prevents duplicate installations when the same extension is installed from VSIX files with different filenames
        // See: https://github.com/eclipse-theia/theia/issues/16845
        const identity = await extractExtensionIdentityFromVsix(localPath);

        if (!identity) {
            // Fallback to filename-based ID if package.json cannot be read
            // This maintains backward compatibility for edge cases
            const extensionId = path.basename(localPath, LocalVSIXFilePluginDeployerResolver.FILE_EXTENSION);
            console.warn(`[${pluginResolverContext.getOriginId()}]: Could not read extension identity from VSIX, falling back to filename: ${extensionId}`);

            if (await existsInDeploymentDir(this.environment, extensionId)) {
                console.log(`[${pluginResolverContext.getOriginId()}]: Target dir already exists in plugin deployment dir`);
                return;
            }

            const extensionDeploymentDir = await unpackToDeploymentDir(this.environment, localPath, extensionId);
            pluginResolverContext.addPlugin(extensionId, extensionDeploymentDir);
            return;
        }

        // Use the versioned ID (publisher.name@version) for the deployment directory
        // This ensures consistent naming regardless of the VSIX filename
        const extensionId = identity.versionedId;

        // Check if an extension with this identity is already deployed in memory
        const existingPlugins = this.pluginDeployerHandler.getDeployedPluginsById(identity.unversionedId);
        if (existingPlugins.length > 0) {
            const existingVersions = existingPlugins.map(p => p.metadata.model.version);
            console.log(`[${pluginResolverContext.getOriginId()}]: Extension "${identity.unversionedId}" is already installed ` +
                `(version(s): ${existingVersions.join(', ')}). Skipping installation of version ${identity.version}.`);
            return;
        }

        // Check if the deployment directory already exists on disk
        if (await existsInDeploymentDir(this.environment, extensionId)) {
            console.log(`[${pluginResolverContext.getOriginId()}]: Extension "${extensionId}" already exists in deployment dir`);
            return;
        }

        const extensionDeploymentDir = await unpackToDeploymentDir(this.environment, localPath, extensionId);
        pluginResolverContext.addPlugin(extensionId, extensionDeploymentDir);
    }
}
