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
import { LocalStorageService, StorageService } from '@theia/core/lib/browser/storage-service';
import { PluginDeployOptions, PluginIdentifiers, PluginServer, PluginStorageKind, PluginType } from '../../common';
import { KeysToAnyValues, KeysToKeysToAnyValue } from '../../common/types';
import { PluginPathsService } from '../../main/common/plugin-paths-protocol';

const GLOBAL_STORAGE_KEY = 'plugin-storage:global';
const WORKSPACE_STORAGE_KEY_PREFIX = 'plugin-storage:workspace:';
const LOCK_NAME_PREFIX = 'theia:plugin-storage:';

/**
 * Plugins of a browser-only application are deployed at build time, so they can't be installed,
 * uninstalled, enabled or disabled at runtime. The queries just report an empty result instead
 * of failing, so callers like the plugin view still have something to render.
 *
 * The plugin key-value storage backing `ExtensionContext.globalState` and
 * `ExtensionContext.workspaceState` lives in the browser's local storage.
 */
@injectable()
export class BrowserOnlyPluginServer implements PluginServer {

    @inject(ILogger) @named('plugin-ext:BrowserOnlyPluginServer')
    protected readonly logger: ILogger;

    // `@theia/workspace` rebinds `StorageService` to `WorkspaceStorageService`, which prefixes every
    // key with the current workspace URI. That would scope `GLOBAL_STORAGE_KEY` per workspace too,
    // so `LocalStorageService` is injected directly instead - the workspace store key already
    // encodes the workspace via `PluginPathsService.getHostStoragePath`.
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
        const storeKey = await this.getStoreKey(kind);
        if (!storeKey) {
            this.logger.warn('Cannot save plugin data: no opened workspace.');
            return false;
        }
        // the browser storage is shared with this application's other tabs, each running its own
        // plugin host, so the read and write below need to be atomic - otherwise a concurrent
        // update from another tab could land in between and get overwritten by this one
        await this.withStoreLock(storeKey, async () => {
            const store = await this.getStore(storeKey);
            if (value === undefined || Object.keys(value).length === 0) {
                delete store[key];
            } else {
                store[key] = value;
            }
            await this.storageService.setData(storeKey, store);
        });
        return true;
    }

    async getStorageValue(key: string, kind: PluginStorageKind): Promise<KeysToAnyValues> {
        return (await this.getAllStorageValues(kind))[key] ?? {};
    }

    async getAllStorageValues(kind: PluginStorageKind): Promise<KeysToKeysToAnyValue> {
        const storeKey = await this.getStoreKey(kind);
        return storeKey ? this.getStore(storeKey) : {};
    }

    protected getStore(storeKey: string): Promise<KeysToKeysToAnyValue> {
        return this.storageService.getData<KeysToKeysToAnyValue>(storeKey, {});
    }

    /**
     * Runs `task` while holding the cross-tab lock for `storeKey`, via the Web Locks API, so a
     * concurrent {@link setStorageValue} on this or another tab can't interleave with it.
     */
    protected withStoreLock<T>(storeKey: string, task: () => Promise<T>): Promise<T> {
        const locks = this.getWebLocks();
        if (locks) {
            return this.requestLock(locks, `${LOCK_NAME_PREFIX}${storeKey}`, task);
        }
        // no Web Locks API (insecure context, older browser): fall back to serializing writes
        // within this tab. A write from another tab can still race and get lost.
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
     * The browser storage key holding the given kind of values, or `undefined` if there's
     * nowhere to keep them - e.g. workspace state while no workspace is open.
     */
    protected async getStoreKey(kind: PluginStorageKind): Promise<string | undefined> {
        if (!kind) {
            return GLOBAL_STORAGE_KEY;
        }
        // derived from the storage path so workspace state follows `ExtensionContext.storageUri`
        const storagePath = await this.pluginPathsService.getHostStoragePath(kind.workspace, kind.roots);
        return storagePath && `${WORKSPACE_STORAGE_KEY_PREFIX}${storagePath}`;
    }
}
