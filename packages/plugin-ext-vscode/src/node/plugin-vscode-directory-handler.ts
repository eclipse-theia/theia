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
import { inject, injectable } from '@theia/core/shared/inversify';
import type { RecursivePartial, URI } from '@theia/core';
import { Deferred, firstTrue } from '@theia/core/lib/common/promise-util';
import { getTempDirPathAsync } from '@theia/plugin-ext/lib/main/node/temp-dir-util';
import {
    PluginDeployerDirectoryHandler, PluginDeployerEntry, PluginDeployerDirectoryHandlerContext,
    PluginDeployerEntryType, PluginPackage, PluginType, PluginIdentifiers
} from '@theia/plugin-ext';
import { FileUri } from '@theia/core/lib/node';
import { PluginCliContribution } from '@theia/plugin-ext/lib/main/node/plugin-cli-contribution';

@injectable()
export class PluginVsCodeDirectoryHandler implements PluginDeployerDirectoryHandler {

    protected readonly deploymentDirectory: Deferred<URI>;

    @inject(PluginCliContribution) protected readonly pluginCli: PluginCliContribution;

    constructor() {
        this.deploymentDirectory = new Deferred();
        getTempDirPathAsync('vscode-copied')
            .then(deploymentDirectoryPath => this.deploymentDirectory.resolve(FileUri.create(deploymentDirectoryPath)));
    }

    async accept(plugin: PluginDeployerEntry): Promise<boolean> {
        console.debug(`Resolving "${plugin.id()}" as a VS Code extension...`);
        return this.attemptResolution(plugin);
    }

    protected async attemptResolution(plugin: PluginDeployerEntry): Promise<boolean> {
        if (this.resolvePackage(plugin)) {
            return true;
        }
        return this.deriveMetadata(plugin);
    }

    protected async deriveMetadata(plugin: PluginDeployerEntry): Promise<boolean> {
        return firstTrue(
            this.resolveFromSources(plugin),
            this.resolveFromVSIX(plugin),
            this.resolveFromNpmTarball(plugin)
        );
    }

    async handle(context: PluginDeployerDirectoryHandlerContext): Promise<void> {
        await this.copyDirectory(context);
        const types: PluginDeployerEntryType[] = [];
        const packageJson: PluginPackage = context.pluginEntry().getValue('package.json');
        if (packageJson.browser) {
            types.push(PluginDeployerEntryType.FRONTEND);
        }
        if (packageJson.main || !packageJson.browser) {
            types.push(PluginDeployerEntryType.BACKEND);
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
                if (await fs.pathExists(targetDir) || !entry.path().startsWith(origin)) {
                    console.log(`[${id}]: already copied.`);
                } else {
                    console.log(`[${id}]: copying to "${targetDir}"`);
                    const deploymentDirectory = await this.deploymentDirectory.promise;
                    await fs.mkdirp(FileUri.fsPath(deploymentDirectory));
                    await context.copy(origin, targetDir);
                    entry.updatePath(targetDir);
                    if (!this.deriveMetadata(entry)) {
                        throw new Error('Unable to resolve plugin metadata after copying');
                    }
                }
            } catch (e) {
                console.warn(`[${id}]: Error when copying.`, e);
                entry.updatePath(pathToRestore);
            }
        }
    }

    protected async resolveFromSources(plugin: PluginDeployerEntry): Promise<boolean> {
        const pluginPath = plugin.path();
        const pck = await this.requirePackage(pluginPath);
        return this.resolvePackage(plugin, { pluginPath, pck });
    }

    protected async resolveFromVSIX(plugin: PluginDeployerEntry): Promise<boolean> {
        if (!(await fs.pathExists(path.join(plugin.path(), 'extension.vsixmanifest')))) {
            return false;
        }
        const pluginPath = path.join(plugin.path(), 'extension');
        const pck = await this.requirePackage(pluginPath);
        return this.resolvePackage(plugin, { pluginPath, pck });
    }

    protected async resolveFromNpmTarball(plugin: PluginDeployerEntry): Promise<boolean> {
        const pluginPath = path.join(plugin.path(), 'package');
        const pck = await this.requirePackage(pluginPath);
        return this.resolvePackage(plugin, { pluginPath, pck });
    }

    protected resolvePackage(plugin: PluginDeployerEntry, options?: {
        pluginPath: string
        pck?: RecursivePartial<PluginPackage>
    }): boolean {
        const { pluginPath, pck } = options || {
            pluginPath: plugin.path(),
            pck: plugin.getValue('package.json')
        };
        if (!pck || !pck.name || !pck.version || !pck.engines || !pck.engines.vscode) {
            return false;
        }
        pck.publisher ??= PluginIdentifiers.UNPUBLISHED;
        if (options) {
            plugin.storeValue('package.json', pck);
            plugin.rootPath = plugin.path();
            plugin.updatePath(pluginPath);
        }
        console.debug(`Resolved "${plugin.id()}" to a VS Code extension "${pck.name}@${pck.version}" with engines:`, pck.engines);
        return true;
    }

    protected async requirePackage(pluginPath: string): Promise<PluginPackage | undefined> {
        try {
            const plugin: PluginPackage = await fs.readJSON(path.join(pluginPath, 'package.json'));
            plugin.publisher ??= PluginIdentifiers.UNPUBLISHED;
            return plugin;
        } catch {
            return undefined;
        }
    }

    protected async getExtensionDir(context: PluginDeployerDirectoryHandlerContext): Promise<string> {
        const deploymentDirectory = await this.deploymentDirectory.promise;
        return FileUri.fsPath(deploymentDirectory.resolve(filenamify(context.pluginEntry().id(), { replacement: '_' })));
    }
}
