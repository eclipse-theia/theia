/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PluginDeployerFileHandler, PluginDeployerEntry, PluginDeployerFileHandlerContext } from "../../../common/plugin-protocol";
import { injectable } from "inversify";
import * as os from "os";
import * as path from "path";

@injectable()
export class PluginTheiaFileHandler implements PluginDeployerFileHandler {

    private unpackedFolder: string;
    constructor() {
        this.unpackedFolder = path.resolve(os.tmpdir(), 'theia-unpacked');
    }

    accept(resolvedPlugin: PluginDeployerEntry): boolean {
        return resolvedPlugin.isFile() && resolvedPlugin.path() !== null && resolvedPlugin.path().endsWith(".theia");
    }

    async handle(context: PluginDeployerFileHandlerContext): Promise<void> {
        // need to unzip
        console.log('unzipping the plugin', context.pluginEntry());

        const unpackedPath = path.resolve(this.unpackedFolder, path.basename(context.pluginEntry().path()));
        await context.unzip(context.pluginEntry().path(), unpackedPath);

        context.pluginEntry().updatePath(unpackedPath);
        return Promise.resolve();
    }
}
