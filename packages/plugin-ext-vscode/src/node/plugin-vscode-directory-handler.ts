/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import {
    PluginDeployerDirectoryHandler,
    PluginDeployerEntry, PluginPackage, PluginDeployerDirectoryHandlerContext,
    PluginDeployerEntryType
} from "@theia/plugin-ext";
import { injectable } from "inversify";
import * as fs from "fs";
import * as path from "path";

@injectable()
export class PluginVsCodeDirectoryHandler implements PluginDeployerDirectoryHandler {

    accept(resolvedPlugin: PluginDeployerEntry): boolean {

        console.log('PluginTheiaDirectoryHandler: accepting plugin with path', resolvedPlugin.path());

        // handle only directories
        if (resolvedPlugin.isFile()) {
            return false;
        }

        // is there a extension.vsixmanifest and extension folder
        const extensionVsixManifestPath = path.resolve(resolvedPlugin.path(), 'extension.vsixmanifest');
        const existsExtensionVsixManifest: boolean = fs.existsSync(extensionVsixManifestPath);
        if (!existsExtensionVsixManifest) {
            return false;
        }

        const extensionPath = path.resolve(resolvedPlugin.path(), 'extension');
        const existsExtension: boolean = fs.existsSync(extensionPath);
        if (!existsExtension) {
            return false;
        }

        // is there a package.json ?
        const packageJsonPath = path.resolve(extensionPath, 'package.json');
        const existsPackageJson: boolean = fs.existsSync(packageJsonPath);
        if (!existsPackageJson) {
            return false;
        }

        let packageJson: PluginPackage = resolvedPlugin.getValue('package.json');
        if (!packageJson) {
            packageJson = require(packageJsonPath);
            resolvedPlugin.storeValue('package.json', packageJson);
        }

        if (!packageJson.engines) {
            return false;
        }

        if (packageJson.engines && packageJson.engines.vscode) {
            console.log("accepting packagejson with engines", packageJson.engines);
            return true;
        }

        return false;

    }

    handle(context: PluginDeployerDirectoryHandlerContext): Promise<any> {
        const packageJson: PluginPackage = context.pluginEntry().getValue('package.json');
        if (packageJson.main) {
            context.pluginEntry().accept(PluginDeployerEntryType.BACKEND);
        }

        const extensionPath = path.resolve(context.pluginEntry().path(), 'extension');
        context.pluginEntry().updatePath(extensionPath);

        return Promise.resolve(true);
    }
}
