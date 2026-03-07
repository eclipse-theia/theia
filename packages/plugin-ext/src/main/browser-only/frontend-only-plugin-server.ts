// *****************************************************************************
// Copyright (C) 2026 Maksim Kachurin
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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, inject } from '@theia/core/shared/inversify';
import {
    PluginServer,
    PluginIdentifiers,
    PluginStorageKind,
} from '../../common/plugin-protocol';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';
import { BrowserOnlyPluginsProvider } from './browser-only-plugins-provider';

@injectable()
export class FrontendOnlyPluginServer implements PluginServer {

    @inject(BrowserOnlyPluginsProvider) protected readonly pluginsProvider: BrowserOnlyPluginsProvider;

    private readonly storage = new Map<string, KeysToAnyValues>();

    private storageKey(key: string, kind: PluginStorageKind): string {
        const k = kind?.workspace ?? (kind?.roots?.join('|') ?? '');
        return `${k}:${key}`;
    }

    install(): Promise<void> {
        return Promise.resolve();
    }

    uninstall(): Promise<void> {
        return Promise.resolve();
    }

    enablePlugin(): Promise<boolean> {
        return Promise.resolve(true);
    }

    disablePlugin(): Promise<boolean> {
        return Promise.resolve(false);
    }

    async getInstalledPlugins(): Promise<readonly PluginIdentifiers.VersionedId[]> {
        const plugins = await this.pluginsProvider.getPlugins();

        return plugins.map(p => PluginIdentifiers.componentsToVersionedId(p.metadata.model));
    }

    getUninstalledPlugins(): Promise<readonly PluginIdentifiers.VersionedId[]> {
        return Promise.resolve([] as readonly PluginIdentifiers.VersionedId[]);
    }

    getDisabledPlugins(): Promise<readonly PluginIdentifiers.UnversionedId[]> {
        return Promise.resolve([]);
    }

    setStorageValue(key: string, value: KeysToAnyValues, kind: PluginStorageKind): Promise<boolean> {
        this.storage.set(this.storageKey(key, kind), value);
        return Promise.resolve(true);
    }

    getStorageValue(key: string, kind: PluginStorageKind): Promise<KeysToAnyValues> {
        return Promise.resolve(this.storage.get(this.storageKey(key, kind)) ?? {});
    }

    getAllStorageValues(kind: PluginStorageKind): Promise<KeysToKeysToAnyValue> {
        const prefix = (kind?.workspace ?? (kind?.roots?.join('|') ?? '')) + ':';
        const out: KeysToKeysToAnyValue = {};
        for (const [k, v] of this.storage) {
            if (k.startsWith(prefix)) {
                out[k.slice(prefix.length)] = v;
            }
        }
        return Promise.resolve(out);
    }
}
