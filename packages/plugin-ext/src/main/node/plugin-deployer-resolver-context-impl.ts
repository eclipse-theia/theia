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

import { PluginDeployerResolverContext, PluginDeployerEntry, PluginDeployerResolverInit } from '../../common/plugin-protocol';
import { PluginDeployerEntryImpl } from './plugin-deployer-entry-impl';

export class PluginDeployerResolverContextImpl<T> implements PluginDeployerResolverContext {

    /**
     * Name of the resolver for this context
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private resolverName: any;

    private pluginEntries: PluginDeployerEntry[];

    constructor(resolver: T, private readonly sourceId: string) {
        this.pluginEntries = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
