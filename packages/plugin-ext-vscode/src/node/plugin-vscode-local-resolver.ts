/********************************************************************************
 * Copyright (C) 2019 David Saunders.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

// tslint:disable:no-any

import { PluginDeployerResolver, PluginDeployerResolverContext } from '@theia/plugin-ext';
import { injectable } from 'inversify';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Resolver that handle the vscode: protocol
 */
@injectable()
export class VsCodeLocalPluginDeployerResolver implements PluginDeployerResolver {

    private static PREFIX_VSCODE_EXTENSION = 'vscode:local/';

    private static PREFIX_EXT_INSTALL = 'ext local ';

    private vscodeExtensionsFolder: string;
    constructor() {
        this.vscodeExtensionsFolder = process.env.VSCODE_PLUGINS || path.resolve(os.tmpdir(), 'vscode-extension-offline');
        if (!fs.existsSync(this.vscodeExtensionsFolder)) {
            fs.mkdirSync(this.vscodeExtensionsFolder);
        }
    }

    /**
     * Resolves the given plugin on the local machine and adds it to the plugin list
     * @param pluginResolverContext The plugin to install locally
     * @returns Promise<void> with rejected error details (if any)
     */
    async resolve(pluginResolverContext: PluginDeployerResolverContext): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const originId = pluginResolverContext.getOriginId();

            let extensionName = '';
            if (originId.startsWith(VsCodeLocalPluginDeployerResolver.PREFIX_VSCODE_EXTENSION)) {
                extensionName = originId.substring(VsCodeLocalPluginDeployerResolver.PREFIX_VSCODE_EXTENSION.length);
            } else if (originId.startsWith(VsCodeLocalPluginDeployerResolver.PREFIX_EXT_INSTALL)) {
                extensionName = originId.substring(VsCodeLocalPluginDeployerResolver.PREFIX_EXT_INSTALL.length);
            }

            if (!extensionName) {
                reject(new Error('Invalid extension' + originId));
                return;
            }

            pluginResolverContext.addPlugin(originId, extensionName);
            resolve();
        });
    }

    /**
     * Defines what is accepted by this class and whether it should be used to install the pluginId
     * @param pluginId The string used to decide whether this install should be accepted
     */
    accept(pluginId: string): boolean {
        return pluginId.startsWith(VsCodeLocalPluginDeployerResolver.PREFIX_VSCODE_EXTENSION) ||
            pluginId.startsWith(VsCodeLocalPluginDeployerResolver.PREFIX_EXT_INSTALL);
    }
}
