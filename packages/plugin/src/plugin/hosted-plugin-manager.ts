/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { HostedPluginManagerExt, Plugin } from '../api/plugin-api';

export interface PluginHost {
    loadPlugin(scriptPath: string): void;

    stopPlugins(): void;
}

export class HostedPluginManagerExtImpl implements HostedPluginManagerExt {

    constructor(private readonly host: PluginHost) {
    }

    $loadPlugin(ext: Plugin): void {
        this.host.loadPlugin(ext.pluginPath);
    }

    $stopPlugin(): PromiseLike<void> {
        this.host.stopPlugins();
        return Promise.resolve();
    }

}
