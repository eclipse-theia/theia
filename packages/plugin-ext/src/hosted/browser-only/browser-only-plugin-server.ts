// *****************************************************************************
// Copyright (C) 2026 Robert Jandow
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

import { inject, injectable, named } from '@theia/core/shared/inversify';
import { Mutex } from 'async-mutex';
import { ILogger, nls } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { LocalStorageService, StorageService } from '@theia/core/lib/browser/storage-service';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileOperationError, FileOperationResult } from '@theia/filesystem/lib/common/files';
import { PluginDeployOptions, PluginIdentifiers, PluginServer, PluginStorageKind, PluginType } from '../../common';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';
import { PluginPaths } from '../../main/common/paths/const';
import { PluginPathsService } from '../../main/common/plugin-paths-protocol';

const GLOBAL_STATE_FILE = 'global-state.json';
const WORKSPACE_STATE_FILE = 'workspace-state.json';
const LEGACY_GLOBAL_STORAGE_KEY = 'plugin-storage:global';
const LEGACY_WORKSPACE_STORAGE_KEY_PREFIX = 'plugin-storage:workspace:';
const LOCK_NAME_PREFIX = 'theia:plugin-storage:';

/** Where one kind of plugin key-value storage is kept. */
export interface BrowserOnlyPluginStore {
    /** The JSON file holding the values. */
    uri: URI;
    /** The local storage key that held the values before they moved to {@link uri}. */
    legacyKey: string;
}

/**
 * Plugins of a browser-only application are deployed at build time, so they can't be installed,
 * uninstalled, enabled or disabled at runtime. The queries just report an empty result instead
 * of failing, so callers like the plugin view still have something to render.
 *
 * The plugin key-value storage backing `ExtensionContext.globalState` and
 * `ExtensionContext.workspaceState` lives in JSON files under the config directory on the
 * browser-local file system, laid out like the backend does.
 */
@injectable()
export class BrowserOnlyPluginServer implements PluginServer {

    @inject(ILogger) @named('plugin-ext:BrowserOnlyPluginServer')
    protected readonly logger: ILogger;

    @inject(FileService)
    protected readonly fileService: FileService;

    @inject(EnvVariablesServer)
    protected readonly envServer: EnvVariablesServer;

    // Only used to move over state kept in local storage by earlier versions. `LocalStorageService`
    // is injected directly because `@theia/workspace` rebinds `StorageService` to one that prefixes
    // every key with the current workspace, which the legacy keys never were.
    @inject(LocalStorageService)
    protected readonly storageService: StorageService;

    @inject(PluginPathsService)
    protected readonly pluginPathsService: PluginPathsService;

    /** Fallback for {@link withStoreLock} when the Web Locks API is unavailable. */
    protected readonly localLock = new Mutex();
    protected missingLocksWarned = false;

    async install(pluginEntry: string, type?: PluginType, options?: PluginDeployOptions): Promise<void> {
        throw new Error(nls.localize('theia/plugin-ext/browserOnlyInstallUnsupported', 'Installing plugins is not supported in a browser-only application.'));
    }

    async uninstall(pluginId: PluginIdentifiers.VersionedId): Promise<void> {
        throw new Error(nls.localize('theia/plugin-ext/browserOnlyUninstallUnsupported', 'Uninstalling plugins is not supported in a browser-only application.'));
    }

    async enablePlugin(pluginId: PluginIdentifiers.UnversionedId): Promise<boolean> {
        throw new Error(nls.localize('theia/plugin-ext/browserOnlyEnableUnsupported', 'Enabling plugins is not supported in a browser-only application.'));
    }

    async disablePlugin(pluginId: PluginIdentifiers.UnversionedId): Promise<boolean> {
        throw new Error(nls.localize('theia/plugin-ext/browserOnlyDisableUnsupported', 'Disabling plugins is not supported in a browser-only application.'));
    }

    async getInstalledPlugins(): Promise<readonly PluginIdentifiers.VersionedId[]> {
        return [];
    }

    async getUninstalledPlugins(): Promise<readonly PluginIdentifiers.VersionedId[]> {
        return [];
    }

    async getDisabledPlugins(): Promise<readonly PluginIdentifiers.UnversionedId[]> {
        return [];
    }

    async setStorageValue(key: string, value: KeysToAnyValues, kind: PluginStorageKind): Promise<boolean> {
        const store = await this.getStore(kind);
        if (!store) {
            this.logger.warn('Cannot save plugin data: no opened workspace.');
            return false;
        }
        // the file is shared with this application's other tabs, each running its own plugin
        // host, so the read and write below need to be atomic - otherwise a concurrent update
        // from another tab could land in between and get overwritten by this one
        await this.withStoreLock(store, async () => {
            const values = await this.readStore(store);
            if (value === undefined || Object.keys(value).length === 0) {
                delete values[key];
            } else {
                values[key] = value;
            }
            // a failed write rejects, so the plugin's `Memento.update` does too instead of
            // resolving for a value that was never saved
            await this.writeStore(store.uri, values);
        });
        return true;
    }

    async getStorageValue(key: string, kind: PluginStorageKind): Promise<KeysToAnyValues> {
        return (await this.getAllStorageValues(kind))[key] ?? {};
    }

    async getAllStorageValues(kind: PluginStorageKind): Promise<KeysToKeysToAnyValue> {
        const store = await this.getStore(kind);
        if (!store) {
            return {};
        }
        try {
            // locked as well, so a read never sees a file another tab is halfway through writing,
            // and two tabs can't both migrate the legacy state
            return await this.withStoreLock(store, () => this.readStore(store));
        } catch (error) {
            // the plugin host loads all state on startup, so throwing here would stop every plugin
            // from loading. Writes still fail, so the file isn't overwritten with the empty state.
            this.logger.error(`Failed to read plugin data from ${store.uri.toString()}:`, error);
            return {};
        }
    }

    /**
     * Reads the values of `store`. Not cached: other tabs write the same file. Must be called
     * while holding the lock for `store`, see {@link withStoreLock}.
     */
    protected async readStore(store: BrowserOnlyPluginStore): Promise<KeysToKeysToAnyValue> {
        let content: string;
        try {
            content = (await this.fileService.readFile(store.uri)).value.toString();
        } catch (error) {
            if (error instanceof FileOperationError && error.fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
                return this.migrateLegacyStore(store);
            }
            throw error;
        }
        try {
            return JSON.parse(content);
        } catch (error) {
            // same as the backend: start over rather than fail every later read and write
            this.logger.error(`Failed to parse plugin data from ${store.uri.toString()}:`, error);
            return {};
        }
    }

    protected async writeStore(uri: URI, values: KeysToKeysToAnyValue): Promise<void> {
        await this.fileService.writeFile(uri, BinaryBuffer.fromString(JSON.stringify(values)));
    }

    /**
     * Moves the values earlier versions kept in local storage over to the file of `store`, so
     * plugins don't lose their state on upgrade. Only called while that file doesn't exist yet.
     */
    protected async migrateLegacyStore(store: BrowserOnlyPluginStore): Promise<KeysToKeysToAnyValue> {
        const values = await this.storageService.getData<KeysToKeysToAnyValue>(store.legacyKey);
        if (values === undefined) {
            return {};
        }
        try {
            await this.writeStore(store.uri, values);
        } catch (error) {
            // better than the empty state `getAllStorageValues` would fall back to. The move is
            // tried again on the next read.
            this.logger.error(`Failed to move plugin data to ${store.uri.toString()}:`, error);
            return values;
        }
        await this.storageService.setData(store.legacyKey, undefined);
        return values;
    }

    /**
     * Runs `task` while holding the cross-tab lock for `store`, via the Web Locks API, so a
     * concurrent read or update of the same store on this or another tab can't interleave with it.
     */
    protected withStoreLock<T>(store: BrowserOnlyPluginStore, task: () => Promise<T>): Promise<T> {
        const locks = this.getWebLocks();
        if (locks) {
            return this.requestLock(locks, `${LOCK_NAME_PREFIX}${store.uri.toString()}`, task);
        }
        // no Web Locks API (insecure context, older browser): fall back to serializing store
        // access within this tab. A write from another tab can still race and get lost.
        if (!this.missingLocksWarned) {
            this.missingLocksWarned = true;
            this.logger.warn('Web Locks API unavailable: plugin storage updates from different tabs may race.');
        }
        return this.localLock.runExclusive(task);
    }

    /** The Web Locks API of this browsing context, or `undefined` in an insecure context or an older browser. */
    protected getWebLocks(): LockManager | undefined {
        return typeof navigator === 'object' ? navigator.locks : undefined;
    }

    /**
     * Requests `name` from `locks` and runs `callback` once granted, same as `LockManager.request()`.
     *
     * `LockGrantedCallback` is typed as `(lock: Lock | null) => T`, which doesn't account for an
     * async or never-settling callback even though the API itself supports and awaits one, hence
     * the cast. Kept as its own method so a subclass or test can swap the lock implementation.
     */
    protected requestLock<T>(locks: LockManager, name: string, callback: () => T | PromiseLike<T>): Promise<T> {
        return locks.request<T>(name, callback as unknown as LockGrantedCallback<T>);
    }

    /**
     * Where the given kind of values is kept, or `undefined` if there's nowhere to keep them -
     * e.g. workspace state while no workspace is open.
     */
    protected async getStore(kind: PluginStorageKind): Promise<BrowserOnlyPluginStore | undefined> {
        const configDirUri = new URI(await this.envServer.getConfigDirUri());
        if (!kind) {
            return {
                uri: configDirUri.resolve(PluginPaths.PLUGINS_GLOBAL_STORAGE_DIR).resolve(GLOBAL_STATE_FILE),
                legacyKey: LEGACY_GLOBAL_STORAGE_KEY
            };
        }
        // kept next to `ExtensionContext.storageUri`. The storage path lives on the same file
        // system as the config dir, so we can take the scheme from there
        const storagePath = await this.pluginPathsService.getHostStoragePath(kind.workspace, kind.roots);
        return storagePath ? {
            uri: configDirUri.withPath(storagePath).resolve(WORKSPACE_STATE_FILE),
            legacyKey: `${LEGACY_WORKSPACE_STORAGE_KEY_PREFIX}${storagePath}`
        } : undefined;
    }
}
