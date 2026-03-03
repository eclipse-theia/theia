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

/**
 * Browser-only frontend module: provides stub implementations of HostedPluginServer,
 * PluginServer, PluginPathsService, and LanguagePackService that use a build-time
 * manifest (./plugins/list.json) instead of backend RPC. Loaded after the default
 * plugin-ext frontend module so these bindings override the RPC proxies.
 */

import { PLUGINS_BASE_PATH } from '@theia/core/lib/common/static-asset-paths';
import { Event } from '@theia/core';
import { ContainerModule } from '@theia/core/shared/inversify';
import {
    HostedPluginServer,
    HostedPluginClient,
    PluginServer,
    DeployedPlugin,
    PluginIdentifiers,
    PluginStorageKind,
    PluginType
} from '../../common/plugin-protocol';
import { PluginPathsService } from '../common/plugin-paths-protocol';
import { LanguagePackService, LanguagePackBundle } from '../../common/language-pack-service';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';
import { ExtPluginApi } from '../../common/plugin-ext-api-contribution';

const PLUGINS_LIST_URL = `./${PLUGINS_BASE_PATH}/list.json`;

interface ListEntry {
    type?: number;
    metadata: {
        host: string;
        model: { id: string; version: string; [k: string]: unknown };
        lifecycle: unknown;
        outOfSync: boolean;
    };
    contributes?: unknown;
}

function toVersionedId(model: { id: string; version: string }): PluginIdentifiers.VersionedId {
    return `${model.id}@${model.version}` as PluginIdentifiers.VersionedId;
}

function parseListEntry(entry: ListEntry): DeployedPlugin {
    return {
        type: (entry.type as PluginType) ?? PluginType.System,
        metadata: entry.metadata as unknown as DeployedPlugin['metadata'],
        contributes: entry.contributes as DeployedPlugin['contributes']
    };
}

async function fetchDeployedPlugins(): Promise<DeployedPlugin[]> {
    const res = await fetch(PLUGINS_LIST_URL);
    if (!res.ok) {
        return [];
    }
    const raw = await res.json() as ListEntry[];
    if (!Array.isArray(raw)) {
        return [];
    }
    return raw.map(parseListEntry);
}

function createFrontendOnlyHostedPluginServer(deployedPlugins: DeployedPlugin[]): HostedPluginServer {
    const versionedIds = deployedPlugins.map(p => toVersionedId(p.metadata.model));
    const byVersionedId = new Map(deployedPlugins.map(p => [toVersionedId(p.metadata.model), p]));

    return {
        setClient(_client: HostedPluginClient | undefined): void { },
        dispose(): void { },
        onDidOpenConnection: Event.None,
        onDidCloseConnection: Event.None,
        getDeployedPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
            return Promise.resolve([...versionedIds]);
        },
        getInstalledPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
            return Promise.resolve([...versionedIds]);
        },
        getUninstalledPluginIds(): Promise<readonly PluginIdentifiers.VersionedId[]> {
            return Promise.resolve([]);
        },
        getDisabledPluginIds(): Promise<readonly PluginIdentifiers.UnversionedId[]> {
            return Promise.resolve([]);
        },
        getDeployedPlugins(ids: PluginIdentifiers.VersionedId[]): Promise<DeployedPlugin[]> {
            const out = ids.map(id => byVersionedId.get(id)).filter((p): p is DeployedPlugin => p !== undefined);
            return Promise.resolve(out);
        },
        getExtPluginAPI(): Promise<ExtPluginApi[]> {
            return Promise.resolve([]);
        },
        onMessage(_targetHost: string, _message: Uint8Array): Promise<void> {
            return Promise.resolve();
        }
    } as HostedPluginServer;
}

function createFrontendOnlyPluginServer(deployedPromise: Promise<DeployedPlugin[]>): PluginServer {
    const storage = new Map<string, KeysToAnyValues>();

    function storageKey(key: string, kind: PluginStorageKind): string {
        const k = kind?.workspace ?? (kind?.roots?.join('|') ?? '');
        return `${k}:${key}`;
    }

    return {
        install(): Promise<void> {
            return Promise.resolve();
        },
        uninstall(): Promise<void> {
            return Promise.resolve();
        },
        enablePlugin(): Promise<boolean> {
            return Promise.resolve(true);
        },
        disablePlugin(): Promise<boolean> {
            return Promise.resolve(false);
        },
        getInstalledPlugins(): Promise<readonly PluginIdentifiers.VersionedId[]> {
            return deployedPromise.then(plugins => plugins.map(p => toVersionedId(p.metadata.model)));
        },
        getUninstalledPlugins(): Promise<readonly PluginIdentifiers.VersionedId[]> {
            return Promise.resolve([]);
        },
        getDisabledPlugins(): Promise<readonly PluginIdentifiers.UnversionedId[]> {
            return Promise.resolve([]);
        },
        setStorageValue(key: string, value: KeysToAnyValues, kind: PluginStorageKind): Promise<boolean> {
            storage.set(storageKey(key, kind), value);
            return Promise.resolve(true);
        },
        getStorageValue(key: string, kind: PluginStorageKind): Promise<KeysToAnyValues> {
            return Promise.resolve(storage.get(storageKey(key, kind)) ?? {});
        },
        getAllStorageValues(kind: PluginStorageKind): Promise<KeysToKeysToAnyValue> {
            const prefix = (kind?.workspace ?? (kind?.roots?.join('|') ?? '')) + ':';
            const out: KeysToKeysToAnyValue = {};
            for (const [k, v] of storage) {
                if (k.startsWith(prefix)) {
                    out[k.slice(prefix.length)] = v;
                }
            }
            return Promise.resolve(out);
        }
    };
}

function createFrontendOnlyPluginPathsService(): PluginPathsService {
    return {
        getHostLogPath(): Promise<string> {
            return Promise.resolve('');
        },
        getHostStoragePath(): Promise<string | undefined> {
            return Promise.resolve(undefined);
        }
    };
}

function createFrontendOnlyLanguagePackService(): LanguagePackService {
    return {
        storeBundle(): void { },
        deleteBundle(): void { },
        getBundle(): Promise<LanguagePackBundle | undefined> {
            return Promise.resolve(undefined);
        }
    };
}

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    const deployedPromise = fetchDeployedPlugins();

    rebind(HostedPluginServer).toDynamicValue(() => {
        let server: HostedPluginServer | undefined;
        const getServer = (): Promise<HostedPluginServer> =>
            server ? Promise.resolve(server) : deployedPromise.then(list => {
                server = createFrontendOnlyHostedPluginServer(list);
                return server;
            });
        return {
            setClient(_client: HostedPluginClient | undefined): void { },
            dispose(): void { },
            onDidOpenConnection: Event.None,
            onDidCloseConnection: Event.None,
            getDeployedPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
                return getServer().then(s => s.getDeployedPluginIds());
            },
            getInstalledPluginIds(): Promise<PluginIdentifiers.VersionedId[]> {
                return getServer().then(s => s.getInstalledPluginIds());
            },
            getUninstalledPluginIds(): Promise<readonly PluginIdentifiers.VersionedId[]> {
                return getServer().then(s => s.getUninstalledPluginIds());
            },
            getDisabledPluginIds(): Promise<readonly PluginIdentifiers.UnversionedId[]> {
                return getServer().then(s => s.getDisabledPluginIds());
            },
            getDeployedPlugins(ids: PluginIdentifiers.VersionedId[]): Promise<DeployedPlugin[]> {
                return getServer().then(s => s.getDeployedPlugins(ids));
            },
            getExtPluginAPI(): Promise<ExtPluginApi[]> {
                return getServer().then(s => s.getExtPluginAPI());
            },
            onMessage(targetHost: string, message: Uint8Array): Promise<void> {
                return getServer().then(s => s.onMessage(targetHost, message));
            }
        } as HostedPluginServer;
    }).inSingletonScope();

    rebind(PluginServer).toDynamicValue(() => createFrontendOnlyPluginServer(deployedPromise)).inSingletonScope();
    rebind(PluginPathsService).toDynamicValue(createFrontendOnlyPluginPathsService).inSingletonScope();
    rebind(LanguagePackService).toDynamicValue(createFrontendOnlyLanguagePackService).inSingletonScope();
});
