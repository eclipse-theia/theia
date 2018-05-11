/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

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
