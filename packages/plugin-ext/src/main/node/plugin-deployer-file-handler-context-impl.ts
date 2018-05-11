/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PluginDeployerEntry, PluginDeployerFileHandlerContext } from "../../common/plugin-protocol";
import * as decompress from "decompress";

export class PluginDeployerFileHandlerContextImpl implements PluginDeployerFileHandlerContext {

    constructor(private readonly pluginDeployerEntry: PluginDeployerEntry) {

    }

    async unzip(sourcePath: string, destPath: string): Promise<void> {
        await decompress(sourcePath, destPath);
        return Promise.resolve();
    }

    pluginEntry(): PluginDeployerEntry {
        return this.pluginDeployerEntry;
    }
}
