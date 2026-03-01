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
import { PluginIdentifiers } from '@theia/plugin-ext/lib/common/plugin-identifiers';

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
        const components = await extractExtensionIdentityFromVsix(localPath);

        if (!components) {
            // Fallback to filename-based ID if package.json cannot be read
            // This maintains backward compatibility for edge cases
            const fallbackId = path.basename(localPath, LocalVSIXFilePluginDeployerResolver.FILE_EXTENSION);
            console.warn(`[${pluginResolverContext.getOriginId()}]: Could not read extension identity from VSIX, falling back to filename: ${fallbackId}`);

            if (await existsInDeploymentDir(this.environment, fallbackId)) {
                console.log(`[${pluginResolverContext.getOriginId()}]: Target dir already exists in plugin deployment dir`);
                return;
            }

            const fallbackDeploymentDir = await unpackToDeploymentDir(this.environment, localPath, fallbackId);
            pluginResolverContext.addPlugin(fallbackId, fallbackDeploymentDir);
            return;
        }

        const unversionedId = PluginIdentifiers.componentsToUnversionedId(components);
        const versionedId = PluginIdentifiers.componentsToVersionedId(components);

        // Check if an extension with this identity is already deployed in memory
        const existingPlugins = this.pluginDeployerHandler.getDeployedPluginsById(unversionedId);
        if (existingPlugins.length > 0) {
            const existingVersions = existingPlugins.map(p => p.metadata.model.version);
            // Throw an error with a user-facing message
            throw new Error(
                'Extension ' + unversionedId + ' (version(s): ' + existingVersions.join(', ') + ') is already installed.\n' +
                'Uninstall the existing extension before installing a new version from VSIX.'
            );
        }

        // Check if the deployment directory already exists on disk
        if (await existsInDeploymentDir(this.environment, versionedId)) {
            console.log(`[${pluginResolverContext.getOriginId()}]: Extension "${versionedId}" already exists in deployment dir`);
            return;
        }

        const extensionDeploymentDir = await unpackToDeploymentDir(this.environment, localPath, versionedId);
        pluginResolverContext.addPlugin(versionedId, extensionDeploymentDir);
    }
}
