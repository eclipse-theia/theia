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
