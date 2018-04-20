/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { HostedPluginManagerExt, Plugin } from '../api/plugin-api';
import { getPluginId } from '../common/plugin-protocol';

export interface PluginHost {
    initialize(contextPath: string): void;

    loadPlugin(plugin: Plugin): void;

    stopPlugins(pluginIds: string[]): void;
}

export class HostedPluginManagerExtImpl implements HostedPluginManagerExt {

    private runningPluginIds: string[];

    constructor(private readonly host: PluginHost) {
        this.runningPluginIds = [];
    }

    $initialize(contextPath: string): void {
        this.host.initialize(contextPath);
    }

    $loadPlugin(plugin: Plugin): void {
        this.runningPluginIds.push(getPluginId(plugin.model));
        this.host.loadPlugin(plugin);
    }

    $stopPlugin(): PromiseLike<void> {
        this.host.stopPlugins(this.runningPluginIds);
        return Promise.resolve();
    }

}
