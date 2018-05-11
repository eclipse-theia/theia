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
} from "../../../common/plugin-protocol";
import { injectable } from "inversify";
import * as fs from "fs";
import * as path from "path";

@injectable()
export class PluginTheiaDirectoryHandler implements PluginDeployerDirectoryHandler {

    accept(resolvedPlugin: PluginDeployerEntry): boolean {

        console.log('PluginTheiaDirectoryHandler: accepting plugin with path', resolvedPlugin.path());

        // handle only directories
        if (resolvedPlugin.isFile()) {
            return false;
        }

        // is there a package.json ?
        const packageJsonPath = path.resolve(resolvedPlugin.path(), 'package.json');
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

        if (packageJson.engines && packageJson.engines.theiaPlugin) {
            return true;
        }

        return false;

    }

    handle(context: PluginDeployerDirectoryHandlerContext): Promise<any> {
        const types: PluginDeployerEntryType[] = [];
        const packageJson: PluginPackage = context.pluginEntry().getValue('package.json');
        if (packageJson.theiaPlugin && packageJson.theiaPlugin.backend) {
            types.push(PluginDeployerEntryType.BACKEND);
        }
        if (packageJson.theiaPlugin && packageJson.theiaPlugin.frontend) {
            types.push(PluginDeployerEntryType.FRONTEND);
        }

        context.pluginEntry().accept(...types);
        return Promise.resolve(true);
    }
}
