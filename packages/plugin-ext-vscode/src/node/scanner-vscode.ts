// *****************************************************************************
// Copyright (C) 2015-2021 Red Hat, Inc.
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
import { injectable } from '@theia/core/shared/inversify';
import { PluginScanner, PluginEngine, PluginPackage, PluginModel, PluginLifecycle, PluginIdentifiers } from '@theia/plugin-ext';
import { TheiaPluginScanner } from '@theia/plugin-ext/lib/hosted/node/scanners/scanner-theia';
import { environment } from '@theia/core/shared/@theia/application-package/lib/environment';
import { VSCodeExtensionUri } from '../common/plugin-vscode-uri';
import { buildLifecycle, buildModelForVsCode } from '@theia/plugin-utils/lib/plugin-model';
import { UIKind } from '@theia/plugin-ext/lib/common/plugin-api-rpc';

const uiKind = environment.electron.is() ? UIKind.Desktop : UIKind.Web;

@injectable()
export class VsCodePluginScanner extends TheiaPluginScanner implements PluginScanner {

    private readonly VSCODE_TYPE: PluginEngine = 'vscode';

    override get apiType(): PluginEngine {
        return this.VSCODE_TYPE;
    }

    override getModel(plugin: PluginPackage): PluginModel {
        const result = buildModelForVsCode({
            ...plugin,
            publisher: plugin.publisher ?? PluginIdentifiers.UNPUBLISHED,
            packageUri: this.pluginUriFactory.createUri(plugin).toString(),
        }, { uiKind: uiKind === UIKind.Web ? 'web' : 'desktop' });
        // Master parity: route through overridable hooks (readme/license/trust).
        result.licenseUrl = this.getLicenseUrl(plugin);
        result.readmeUrl = this.getReadmeUrl(plugin);
        this.applyTrustExtraction(plugin, result);
        return result;
    }

    /**
     * Maps extension dependencies to deployable extension dependencies.
     */
    override getDependencies(plugin: PluginPackage): Map<string, string> | undefined {
        const dependencies = new Map<string, string>();
        for (const dependency of [plugin.extensionDependencies, plugin.extensionPack]) {
            if (dependency !== undefined) {
                dependency.forEach((dep: string) => {
                    const dependencyId = dep.toLowerCase();
                    dependencies.set(dependencyId, VSCodeExtensionUri.fromId(dependencyId).toString());
                });
            }
        }
        return dependencies.size > 0 ? dependencies : undefined;
    }

    override getLifecycle(plugin: PluginPackage): PluginLifecycle {
        return {
            ...buildLifecycle(plugin, 'vscode'),
            backendInitPath: path.join(__dirname, 'plugin-vscode-init'),
        };
    }

}
