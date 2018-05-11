/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { PluginDeployerResolverContext, PluginDeployerEntry, PluginDeployerResolverInit } from "../../common/plugin-protocol";
import { PluginDeployerEntryImpl } from "./plugin-deployer-entry-impl";

export class PluginDeployerResolverContextImpl<T> implements PluginDeployerResolverContext {

    /**
     * Name of the resolver for this context
     */
    private resolverName: any;

    private pluginEntries: PluginDeployerEntry[];

    constructor(resolver: T, private readonly sourceId: string) {
        this.pluginEntries = [];
        this.resolverName = (resolver as any).constructor.name;

    }

    addPlugin(pluginId: string, path: string): void {
        const pluginEntry = new PluginDeployerEntryImpl(this.sourceId, pluginId, path);
        pluginEntry.setResolvedBy(this.resolverName);
        this.pluginEntries.push(pluginEntry);
    }

    getPlugins(): PluginDeployerEntry[] {
        return this.pluginEntries;
    }

    getOriginId(): string {
        return this.sourceId;
    }

}

export class PluginDeployerResolverInitImpl implements PluginDeployerResolverInit {

}
