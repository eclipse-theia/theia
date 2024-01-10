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
import * as fs from '@theia/core/shared/fs-extra';
import { inject, injectable } from '@theia/core/shared/inversify';
import type { RecursivePartial, URI } from '@theia/core';
import { Deferred, firstTrue } from '@theia/core/lib/common/promise-util';
import {
    PluginDeployerDirectoryHandler, PluginDeployerEntry, PluginDeployerDirectoryHandlerContext,
    PluginDeployerEntryType, PluginPackage, PluginIdentifiers
} from '@theia/plugin-ext';
import { PluginCliContribution } from '@theia/plugin-ext/lib/main/node/plugin-cli-contribution';
import { TMP_DIR_PREFIX } from './plugin-vscode-utils';

@injectable()
export class PluginVsCodeDirectoryHandler implements PluginDeployerDirectoryHandler {

    protected readonly deploymentDirectory: Deferred<URI>;

    @inject(PluginCliContribution) protected readonly pluginCli: PluginCliContribution;

    async accept(plugin: PluginDeployerEntry): Promise<boolean> {
        console.debug(`Resolving "${plugin.id()}" as a VS Code extension...`);
        if (plugin.path().startsWith(TMP_DIR_PREFIX)) {
            // avoid adding corrupted plugins from temporary directories
            return false;
        }
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
}
