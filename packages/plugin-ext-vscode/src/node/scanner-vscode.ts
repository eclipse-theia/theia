/********************************************************************************
 * Copyright (C) 2015-2018 Red Hat, Inc.
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

import { injectable } from 'inversify';
import { PluginScanner, PluginEngine, PluginPackage, PluginModel, PluginLifecycle } from '@theia/plugin-ext';
import { TheiaPluginScanner } from '@theia/plugin-ext/lib/hosted/node/scanners/scanner-theia';

@injectable()
export class VsCodePluginScanner extends TheiaPluginScanner implements PluginScanner {
    private readonly VSCODE_TYPE: PluginEngine = 'vscode';
    private readonly VSCODE_PREFIX: string = 'vscode:extension/';

    get apiType(): PluginEngine {
        return this.VSCODE_TYPE;
    }

    getModel(plugin: PluginPackage): PluginModel {
        const result: PluginModel = {
            packagePath: plugin.packagePath,
            // see id definition: https://github.com/microsoft/vscode/blob/15916055fe0cb9411a5f36119b3b012458fe0a1d/src/vs/platform/extensions/common/extensions.ts#L167-L169
            id: `${plugin.publisher.toLowerCase()}.${plugin.name.toLowerCase()}`,
            name: plugin.name,
            publisher: plugin.publisher,
            version: plugin.version,
            displayName: plugin.displayName,
            description: plugin.description,
            engine: {
                type: this.VSCODE_TYPE,
                version: plugin.engines[this.VSCODE_TYPE]
            },
            entryPoint: {
                backend: plugin.main
            }
        };
        return result;
    }

    /**
     * Maps extension dependencies to deployable extension dependencies.
     */
    getDependencies(plugin: PluginPackage): Map<string, string> | undefined {
        if (!plugin.extensionDependencies || !plugin.extensionDependencies.length) {
            return undefined;
        }
        const dependencies = new Map<string, string>();
        for (const dependency of plugin.extensionDependencies) {
            const dependencyId = dependency.toLowerCase();
            dependencies.set(dependencyId, this.VSCODE_PREFIX + dependencyId);
        }
        return dependencies;
    }

    getLifecycle(plugin: PluginPackage): PluginLifecycle {
        return {
            startMethod: 'activate',
            stopMethod: 'deactivate',

            backendInitPath: __dirname + '/plugin-vscode-init.js'
        };
    }

}
