/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { HostedPluginManagerExt, Plugin } from "../../api/plugin-api";
import { getPluginId, PluginMetadata } from "../../common/plugin-protocol";

export interface PluginHost {
    initialize(contextPath: string, pluginMetadata: PluginMetadata): void;

    loadPlugin(contextPath: string, plugin: Plugin): void;

    stopPlugins(contextPath: string, pluginIds: string[]): void;
}

export class HostedPluginManagerExtImpl implements HostedPluginManagerExt {

    private runningPluginIds: string[];

    constructor(private readonly host: PluginHost) {
        this.runningPluginIds = [];
    }

    $initialize(contextPath: string, pluginMetadata: PluginMetadata): void {
        this.host.initialize(contextPath, pluginMetadata);
    }

    $loadPlugin(contextPath: string, plugin: Plugin): void {
        this.runningPluginIds.push(getPluginId(plugin.model));
        this.host.loadPlugin(contextPath, plugin);
    }

    $stopPlugin(contextPath: string): PromiseLike<void> {
        this.host.stopPlugins(contextPath, this.runningPluginIds);
        return Promise.resolve();
    }

}
