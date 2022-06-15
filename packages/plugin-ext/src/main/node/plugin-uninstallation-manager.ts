// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import { Emitter, Event } from '@theia/core';
import { injectable } from '@theia/core/shared/inversify';
import { PluginIdentifiers } from '../../common';

@injectable()
export class PluginUninstallationManager {
    protected readonly onDidChangeUninstalledPluginsEmitter = new Emitter<readonly PluginIdentifiers.VersionedId[]>();

    get onDidChangeUninstalledPlugins(): Event<readonly PluginIdentifiers.VersionedId[]> {
        return this.onDidChangeUninstalledPluginsEmitter.event;
    }

    protected uninstalledPlugins: PluginIdentifiers.VersionedId[] = [];

    markAsUninstalled(pluginId: PluginIdentifiers.VersionedId): boolean {
        if (!this.uninstalledPlugins.includes(pluginId)) {
            this.uninstalledPlugins.push(pluginId);
            this.onDidChangeUninstalledPluginsEmitter.fire(Object.freeze(this.uninstalledPlugins.slice()));
            return true;
        }
        return false;
    }

    markAsInstalled(pluginId: PluginIdentifiers.VersionedId): boolean {
        let index: number;
        let didChange = false;
        while ((index = this.uninstalledPlugins.indexOf(pluginId)) !== -1) {
            this.uninstalledPlugins.splice(index, 1);
            didChange = true;
        }
        if (didChange) {
            this.onDidChangeUninstalledPluginsEmitter.fire(Object.freeze(this.uninstalledPlugins.slice()));
        }
        return didChange;
    }

    isUninstalled(pluginId: PluginIdentifiers.VersionedId): boolean {
        return this.uninstalledPlugins.includes(pluginId);
    }

    getUninstalledPluginIds(): readonly PluginIdentifiers.VersionedId[] {
        return Object.freeze(this.uninstalledPlugins.slice());
    }
}
