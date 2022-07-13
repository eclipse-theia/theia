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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as path from 'path';
import { PluginDeployerFileHandler, PluginDeployerEntry, PluginDeployerFileHandlerContext, PluginType } from '../../../common/plugin-protocol';
import { injectable, inject } from '@theia/core/shared/inversify';
import { getTempDir } from '../temp-dir-util';
import * as fs from '@theia/core/shared/fs-extra';
import * as filenamify from 'filenamify';
import { FileUri } from '@theia/core/lib/node/file-uri';
import { PluginTheiaEnvironment } from '../../common/plugin-theia-environment';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class PluginTheiaFileHandler implements PluginDeployerFileHandler {

    private readonly systemPluginsDirUri = FileUri.create(getTempDir('theia-unpacked'));

    @inject(PluginTheiaEnvironment)
    protected readonly environment: PluginTheiaEnvironment;

    accept(resolvedPlugin: PluginDeployerEntry): boolean {
        return resolvedPlugin.isFile() && resolvedPlugin.path() !== null && resolvedPlugin.path().endsWith('.theia');
    }

    async handle(context: PluginDeployerFileHandlerContext): Promise<void> {
        await this.ensureDiscoverability(context);
        const id = context.pluginEntry().id();
        const pluginDir = await this.getPluginDir(context);
        console.log(`[${id}]: trying to decompress into "${pluginDir}"...`);
        if (context.pluginEntry().type === PluginType.User && await fs.pathExists(pluginDir)) {
            console.log(`[${id}]: already found`);
            context.pluginEntry().updatePath(pluginDir);
            return;
        }
        await context.unzip(context.pluginEntry().path(), pluginDir);
        console.log(`[${id}]: decompressed`);
        context.pluginEntry().updatePath(pluginDir);
    }

    /**
     * Ensures that a user-installed plugin file is transferred to the user extension folder.
     */
    protected async ensureDiscoverability(context: PluginDeployerFileHandlerContext): Promise<void> {
        if (context.pluginEntry().type === PluginType.User) {
            const userExtensionsDir = await this.environment.getPluginsDirUri();
            const currentPath = context.pluginEntry().path();
            if (!userExtensionsDir.isEqualOrParent(new URI(currentPath)) && !userExtensionsDir.isEqualOrParent(new URI(context.pluginEntry().originalPath()))) {
                try {
                    const newPath = FileUri.fsPath(userExtensionsDir.resolve(path.basename(currentPath)));
                    await fs.mkdirp(FileUri.fsPath(userExtensionsDir));
                    await new Promise<void>((resolve, reject) => {
                        fs.copyFile(currentPath, newPath, error => error ? reject(error) : resolve());
                    });
                    context.pluginEntry().updatePath(newPath);
                    context.pluginEntry().storeValue('sourceLocations', [newPath]);
                } catch (e) {
                    console.error(`[${context.pluginEntry().id}]: Failed to copy to user directory. Future sessions may not have access to this plugin.`);
                }
            }
        }
    }

    protected async getPluginDir(context: PluginDeployerFileHandlerContext): Promise<string> {
        return FileUri.fsPath(this.systemPluginsDirUri.resolve(filenamify(context.pluginEntry().id(), { replacement: '_' })));
    }
}
