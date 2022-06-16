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

import { PluginDeployerFileHandler, PluginDeployerEntry, PluginDeployerFileHandlerContext, PluginType } from '@theia/plugin-ext';
import * as fs from '@theia/core/shared/fs-extra';
import * as path from 'path';
import * as filenamify from 'filenamify';
import { injectable, inject } from '@theia/core/shared/inversify';
import { getTempDir } from '@theia/plugin-ext/lib/main/node/temp-dir-util';
import { PluginVSCodeEnvironment } from '../common/plugin-vscode-environment';
import { FileUri } from '@theia/core/lib/node/file-uri';
import URI from '@theia/core/lib/common/uri';

@injectable()
export class PluginVsCodeFileHandler implements PluginDeployerFileHandler {

    @inject(PluginVSCodeEnvironment)
    protected readonly environment: PluginVSCodeEnvironment;

    private readonly systemExtensionsDirUri = FileUri.create(getTempDir('vscode-unpacked'));

    accept(resolvedPlugin: PluginDeployerEntry): boolean {
        if (!resolvedPlugin.isFile()) {
            return false;
        }
        const pluginPath = resolvedPlugin.path();
        return !!pluginPath && pluginPath.endsWith('.vsix') || pluginPath.endsWith('.tgz');
    }

    async handle(context: PluginDeployerFileHandlerContext): Promise<void> {
        await this.ensureDiscoverability(context);
        const id = context.pluginEntry().id();
        const extensionDir = await this.getExtensionDir(context);
        console.log(`[${id}]: trying to decompress into "${extensionDir}"...`);
        if (context.pluginEntry().type === PluginType.User && await fs.pathExists(extensionDir)) {
            console.log(`[${id}]: already found`);
            context.pluginEntry().updatePath(extensionDir);
            return;
        }
        await this.decompress(extensionDir, context);
        console.log(`[${id}]: decompressed`);
        context.pluginEntry().updatePath(extensionDir);
    }

    protected async getExtensionDir(context: PluginDeployerFileHandlerContext): Promise<string> {
        return FileUri.fsPath(this.systemExtensionsDirUri.resolve(filenamify(context.pluginEntry().id(), { replacement: '_' })));
    }

    /**
     * Ensures that a user-installed plugin file is transferred to the user extension folder.
     */
    protected async ensureDiscoverability(context: PluginDeployerFileHandlerContext): Promise<void> {
        if (context.pluginEntry().type === PluginType.User) {
            const userExtensionsDir = await this.environment.getExtensionsDirUri();
            const currentPath = context.pluginEntry().path();
            if (!userExtensionsDir.isEqualOrParent(new URI(currentPath)) && !userExtensionsDir.isEqualOrParent(new URI(context.pluginEntry().originalPath()))) {
                try {
                    const newPath = FileUri.fsPath(userExtensionsDir.resolve(path.basename(currentPath)));
                    await fs.mkdirp(FileUri.fsPath(userExtensionsDir));
                    await new Promise<void>((resolve, reject) => {
                        fs.copyFile(currentPath, newPath, error => error ? reject(error) : resolve());
                    });
                    context.pluginEntry().updatePath(newPath);
                } catch (e) {
                    console.error(`[${context.pluginEntry().id}]: Failed to copy to user directory. Future sessions may not have access to this plugin.`);
                }
            }
        }
    }

    protected async decompress(extensionDir: string, context: PluginDeployerFileHandlerContext): Promise<void> {
        await context.unzip(context.pluginEntry().path(), extensionDir);
        if (context.pluginEntry().path().endsWith('.tgz')) {
            const extensionPath = path.join(extensionDir, 'package');
            const vscodeNodeModulesPath = path.join(extensionPath, 'vscode_node_modules.zip');
            if (await fs.pathExists(vscodeNodeModulesPath)) {
                await context.unzip(vscodeNodeModulesPath, path.join(extensionPath, 'node_modules'));
            }
        }
    }

}
