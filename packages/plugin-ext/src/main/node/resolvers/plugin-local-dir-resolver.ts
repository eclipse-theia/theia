/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PluginDeployerResolver, PluginDeployerResolverContext } from "../../../common/plugin-protocol";
import { injectable } from "inversify";
import * as fs from "fs";
import * as path from "path";

@injectable()
export class LocalDirectoryPluginDeployerResolver implements PluginDeployerResolver {

    /**
     * Check all files/folder from the local-dir referenced and add them as plugins.
     */
    async resolve(pluginResolverContext: PluginDeployerResolverContext): Promise<void> {

        // get directory
        const localDirSetting = pluginResolverContext.getOriginId();
        if (!localDirSetting.startsWith('local-dir')) {
            return;
        }
        // remove prefix
        const dirPath = localDirSetting.substring('local-dir'.length + 1);

        // check directory exists
        if (!fs.existsSync(dirPath)) {
            throw new Error("The directory referenced by " + pluginResolverContext.getOriginId() + " does not exist.");

        }
        // list all stuff from this directory
        await new Promise((resolve: any, reject: any) => {
            fs.readdir(dirPath, (err: any, files: any) => {
                files.forEach((file: any) => {
                    pluginResolverContext.addPlugin(file, path.resolve(dirPath, file));
                });
                resolve(true);
            });

        });

        return Promise.resolve();
    }
    accept(pluginId: string): boolean {
        return pluginId.startsWith('local-dir');
    }
}
