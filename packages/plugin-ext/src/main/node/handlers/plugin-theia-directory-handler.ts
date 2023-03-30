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
import * as filenamify from 'filenamify';
import * as fs from '@theia/core/shared/fs-extra';
import { inject, injectable } from '@theia/core/shared/inversify';
import { FileUri } from '@theia/core/lib/node';
import {
    PluginDeployerDirectoryHandler, PluginDeployerEntry, PluginPackage, PluginDeployerDirectoryHandlerContext, PluginDeployerEntryType, PluginType, PluginIdentifiers
} from '../../../common/plugin-protocol';
import { PluginCliContribution } from '../plugin-cli-contribution';
import { getTempDir } from '../temp-dir-util';

@injectable()
export class PluginTheiaDirectoryHandler implements PluginDeployerDirectoryHandler {

    protected readonly deploymentDirectory = FileUri.create(getTempDir('theia-copied'));

    @inject(PluginCliContribution) protected readonly pluginCli: PluginCliContribution;

    accept(resolvedPlugin: PluginDeployerEntry): boolean {

        console.debug('PluginTheiaDirectoryHandler: accepting plugin with path', resolvedPlugin.path());

        // handle only directories
        if (resolvedPlugin.isFile()) {
            return false;
        }

        // is there a package.json ?
        const packageJsonPath = path.resolve(resolvedPlugin.path(), 'package.json');

        try {
            let packageJson = resolvedPlugin.getValue<PluginPackage>('package.json');
            if (!packageJson) {
                packageJson = fs.readJSONSync(packageJsonPath);
                packageJson.publisher ??= PluginIdentifiers.UNPUBLISHED;
                resolvedPlugin.storeValue('package.json', packageJson);
            }

            if (packageJson?.engines?.theiaPlugin) {
                return true;
            }
        } catch { /* Failed to read file. Fall through. */ }
        return false;
    }

    async handle(context: PluginDeployerDirectoryHandlerContext): Promise<void> {
        await this.copyDirectory(context);
        const types: PluginDeployerEntryType[] = [];
        const packageJson = context.pluginEntry().getValue<PluginPackage>('package.json');
        if (packageJson.theiaPlugin && packageJson.theiaPlugin.backend) {
            types.push(PluginDeployerEntryType.BACKEND);
        }
        if (packageJson.theiaPlugin && packageJson.theiaPlugin.frontend) {
            types.push(PluginDeployerEntryType.FRONTEND);
        }

        context.pluginEntry().accept(...types);
    }

    protected async copyDirectory(context: PluginDeployerDirectoryHandlerContext): Promise<void> {
        if (this.pluginCli.copyUncompressedPlugins() && context.pluginEntry().type === PluginType.User) {
            const entry = context.pluginEntry();
            const id = entry.id();
            const pathToRestore = entry.path();
            const origin = entry.originalPath();
            const targetDir = await this.getExtensionDir(context);
            try {
                if (fs.existsSync(targetDir) || !entry.path().startsWith(origin)) {
                    console.log(`[${id}]: already copied.`);
                } else {
                    console.log(`[${id}]: copying to "${targetDir}"`);
                    await fs.mkdirp(FileUri.fsPath(this.deploymentDirectory));
                    await context.copy(origin, targetDir);
                    entry.updatePath(targetDir);
                    if (!this.accept(entry)) {
                        throw new Error('Unable to resolve plugin metadata after copying');
                    }
                }
            } catch (e) {
                console.warn(`[${id}]: Error when copying.`, e);
                entry.updatePath(pathToRestore);
            }
        }
    }

    protected async getExtensionDir(context: PluginDeployerDirectoryHandlerContext): Promise<string> {
        return FileUri.fsPath(this.deploymentDirectory.resolve(filenamify(context.pluginEntry().id(), { replacement: '_' })));
    }
}
