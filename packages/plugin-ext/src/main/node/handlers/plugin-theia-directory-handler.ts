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
import * as filenamify from 'filenamify';
import * as fs from '@theia/core/shared/fs-extra';
import type { URI } from '@theia/core';
import { inject, injectable } from '@theia/core/shared/inversify';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { FileUri } from '@theia/core/lib/node';
import {
    PluginDeployerDirectoryHandler, PluginDeployerEntry, PluginPackage, PluginDeployerDirectoryHandlerContext, PluginDeployerEntryType, PluginType, PluginIdentifiers
} from '../../../common/plugin-protocol';
import { PluginCliContribution } from '../plugin-cli-contribution';
import { getTempDirPathAsync } from '../temp-dir-util';

@injectable()
export abstract class AbstractPluginDirectoryHandler implements PluginDeployerDirectoryHandler {

    protected readonly deploymentDirectory: Deferred<URI>;

    @inject(PluginCliContribution) protected readonly pluginCli: PluginCliContribution;

    constructor() {
        this.deploymentDirectory = new Deferred();
        getTempDirPathAsync('theia-copied')
            .then(deploymentDirectory => this.deploymentDirectory.resolve(FileUri.create(deploymentDirectory)));
    }

    async accept(resolvedPlugin: PluginDeployerEntry): Promise<boolean> {

        console.debug(`Plugin directory handler: accepting plugin with path ${resolvedPlugin.path()}`);

        // handle only directories
        if (await resolvedPlugin.isFile()) {
            return false;
        }

        // Was this directory unpacked from an NPM tarball?
        const wasTarball = resolvedPlugin.originalPath().endsWith('.tgz');
        const rootPath = resolvedPlugin.path();
        const basePath = wasTarball ? path.resolve(rootPath, 'package') : rootPath;

        // is there a package.json ?
        const packageJsonPath = path.resolve(basePath, 'package.json');

        try {
            let packageJson = resolvedPlugin.getValue<PluginPackage>('package.json');
            if (!packageJson) {
                packageJson = await fs.readJSON(packageJsonPath);
                packageJson.publisher ??= PluginIdentifiers.UNPUBLISHED;
                resolvedPlugin.storeValue('package.json', packageJson);
            }

            if (this.acceptManifest(packageJson)) {
                if (wasTarball) {
                    resolvedPlugin.updatePath(basePath);
                    resolvedPlugin.rootPath = rootPath;
                }
                return true;
            }
        } catch { /* Failed to read file. Fall through. */ }
        return false;
    }

    protected abstract acceptManifest(plugin: PluginPackage): boolean;

    abstract handle(context: PluginDeployerDirectoryHandlerContext): Promise<void>;

    protected async copyDirectory(context: PluginDeployerDirectoryHandlerContext): Promise<void> {
        if (this.pluginCli.copyUncompressedPlugins() && context.pluginEntry().type === PluginType.User) {
            const entry = context.pluginEntry();
            const id = entry.id();
            const pathToRestore = entry.path();
            const origin = entry.originalPath();
            const targetDir = await this.getExtensionDir(context);
            try {
                if (await fs.pathExists(targetDir) || !entry.path().startsWith(origin)) {
                    console.log(`[${id}]: already copied.`);
                } else {
                    console.log(`[${id}]: copying to "${targetDir}"`);
                    const deploymentDirectory = await this.deploymentDirectory.promise;
                    await fs.mkdirp(FileUri.fsPath(deploymentDirectory));
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
        const deploymentDirectory = await this.deploymentDirectory.promise;
        return FileUri.fsPath(deploymentDirectory.resolve(filenamify(context.pluginEntry().id(), { replacement: '_' })));
    }

}

@injectable()
export class PluginTheiaDirectoryHandler extends AbstractPluginDirectoryHandler {

    protected acceptManifest(plugin: PluginPackage): boolean {
        return plugin?.engines?.theiaPlugin !== undefined;
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
}
