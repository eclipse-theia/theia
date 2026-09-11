// *****************************************************************************
// Copyright (C) 2026 robertjndw
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

import { expect } from 'chai';
import { ILogger } from '@theia/core';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
import { LocalStorageService, StorageService } from '@theia/core/lib/browser/storage-service';
import { PluginPathsService } from '../../main/common/plugin-paths-protocol';
import { BrowserOnlyPluginServer } from './browser-only-plugin-server';
import { installFakeLockManager as installNavigatorLocks } from './test/navigator-locks-test-util';

class InMemoryStorageService implements StorageService {
    readonly data = new Map<string, string>();

    async setData<T>(key: string, data: T): Promise<void> {
        this.data.set(key, JSON.stringify(data));
    }

    async getData<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        const stored = this.data.get(key);
        return stored === undefined ? defaultValue : JSON.parse(stored);
    }
}

/**
 * Stands for `@theia/workspace`'s `WorkspaceStorageService`, to which `@theia/workspace` rebinds
 * the plain `StorageService` symbol, prefixing every key with the current workspace.
 */
class PrefixingStorageService implements StorageService {

    constructor(private readonly delegate: InMemoryStorageService, private readonly prefix: string) { }

    setData<T>(key: string, data: T): Promise<void> {
        return this.delegate.setData(`${this.prefix}:${key}`, data);
    }

    getData<T>(key: string, defaultValue?: T): Promise<T | undefined> {
        return this.delegate.getData(`${this.prefix}:${key}`, defaultValue);
    }
}

const pluginPathsService: PluginPathsService = {
    getHostLogPath: async () => '/logs/host',
    getHostStoragePath: async workspaceUri => workspaceUri && `/workspace-storage/${workspaceUri}`
};

/**
 * A minimal stand-in for the browser's `LockManager`: grants a lock request only once every
 * earlier request for the same name has settled, so that two `request()` calls for the same
 * name never run concurrently, same as the real Web Locks API guarantees across tabs.
 */
class FakeLockManager {
    private readonly queues = new Map<string, Promise<unknown>>();

    request<T>(name: string, callback: () => T | PromiseLike<T>): Promise<T> {
        const previous = this.queues.get(name) ?? Promise.resolve();
        const run = (async () => {
            await previous.catch(() => undefined);
            return callback();
        })();
        this.queues.set(name, run.catch(() => undefined));
        return run;
    }
}

/** Installs a {@link FakeLockManager} as `navigator.locks`; see {@link installNavigatorLocks}. */
function installFakeLockManager(): () => void {
    return installNavigatorLocks(new FakeLockManager());
}

describe('BrowserOnlyPluginServer', () => {

    let storageService: InMemoryStorageService;

    function createServer(): BrowserOnlyPluginServer {
        const container = new Container();
        container.bind(BrowserOnlyPluginServer).toSelf().inSingletonScope();
        container.bind(ILogger).to(MockLogger);
        container.bind<StorageService>(LocalStorageService).toConstantValue(storageService);
        container.bind(PluginPathsService).toConstantValue(pluginPathsService);
        return container.get(BrowserOnlyPluginServer);
    }

    beforeEach(() => {
        storageService = new InMemoryStorageService();
    });

    it('keeps global state across sessions', async () => {
        expect(await createServer().setStorageValue('my.plugin', { count: 1 }, undefined)).to.be.true;

        // a fresh server stands for the next session, reading from the same browser storage
        expect(await createServer().getStorageValue('my.plugin', undefined)).to.deep.equal({ count: 1 });
    });

    it('keeps global state independent of a workspace-scoped StorageService binding', async () => {
        const container = new Container();
        container.bind(BrowserOnlyPluginServer).toSelf().inSingletonScope();
        container.bind(ILogger).to(MockLogger);
        container.bind<StorageService>(LocalStorageService).toConstantValue(storageService);
        // simulates `@theia/workspace` rebinding the plain `StorageService` symbol; `BrowserOnlyPluginServer`
        // must ignore it and inject `LocalStorageService` directly, or global state would end up
        // scoped per workspace too
        container.bind(StorageService).toConstantValue(new PrefixingStorageService(storageService, 'file:///a'));
        container.bind(PluginPathsService).toConstantValue(pluginPathsService);
        const server = container.get(BrowserOnlyPluginServer);

        await server.setStorageValue('my.plugin', { count: 1 }, undefined);

        expect(storageService.data.has('plugin-storage:global')).to.be.true;
        expect(storageService.data.has('file:///a:plugin-storage:global')).to.be.false;
    });

    it('keeps workspace state per workspace', async () => {
        const server = createServer();
        await server.setStorageValue('my.plugin', { count: 1 }, { workspace: 'file:///a', roots: [] });
        await server.setStorageValue('my.plugin', { count: 2 }, { workspace: 'file:///b', roots: [] });

        expect(await server.getStorageValue('my.plugin', { workspace: 'file:///a', roots: [] })).to.deep.equal({ count: 1 });
        expect(await server.getStorageValue('my.plugin', { workspace: 'file:///b', roots: [] })).to.deep.equal({ count: 2 });
    });

    it('keeps global and workspace state apart', async () => {
        const server = createServer();
        await server.setStorageValue('my.plugin', { scope: 'global' }, undefined);
        await server.setStorageValue('my.plugin', { scope: 'workspace' }, { workspace: 'file:///a', roots: [] });

        expect(await server.getStorageValue('my.plugin', undefined)).to.deep.equal({ scope: 'global' });
        expect(await server.getAllStorageValues({ workspace: 'file:///a', roots: [] })).to.deep.equal({ 'my.plugin': { scope: 'workspace' } });
    });

    it('cannot keep workspace state while no workspace is open', async () => {
        const server = createServer();

        expect(await server.setStorageValue('my.plugin', { count: 1 }, { workspace: undefined, roots: [] })).to.be.false;
        expect(await server.getAllStorageValues({ workspace: undefined, roots: [] })).to.deep.equal({});
    });

    it('does not drop what another host stored in the meantime', async () => {
        const one = createServer();
        // stands for another tab of the application, running its own plugin host over the same browser storage
        const other = createServer();
        await one.setStorageValue('plugin.one', { count: 1 }, undefined);
        // as the plugin host does on start up, before the other tab writes
        await one.getAllStorageValues(undefined);

        await other.setStorageValue('plugin.other', { count: 2 }, undefined);
        await one.setStorageValue('plugin.one', { count: 3 }, undefined);

        expect(await createServer().getAllStorageValues(undefined)).to.deep.equal({
            'plugin.one': { count: 3 },
            'plugin.other': { count: 2 }
        });
    });

    describe('concurrent writes from two tabs', () => {

        async function assertNeitherUpdateIsLost(): Promise<void> {
            const one = createServer();
            // stands for another tab of the application, running its own plugin host over the same browser storage
            const other = createServer();

            // genuinely concurrent, unlike the earlier tests that await one call before starting the next
            await Promise.all([
                one.setStorageValue('plugin.one', { count: 1 }, undefined),
                other.setStorageValue('plugin.other', { count: 2 }, undefined)
            ]);

            expect(await createServer().getAllStorageValues(undefined)).to.deep.equal({
                'plugin.one': { count: 1 },
                'plugin.other': { count: 2 }
            });
        }

        it('does not lose either update, serialized via the Web Locks API', async () => {
            const restore = installFakeLockManager();
            try {
                await assertNeitherUpdateIsLost();
            } finally {
                restore();
            }
        });

        it('does not lose either update, serialized via the same-realm fallback when the Web Locks API is unavailable', async () => {
            await assertNeitherUpdateIsLost();
        });
    });

    it('drops a value that is set to nothing', async () => {
        const server = createServer();
        await server.setStorageValue('my.plugin', { count: 1 }, undefined);

        await server.setStorageValue('my.plugin', {}, undefined);

        expect(await createServer().getAllStorageValues(undefined)).to.deep.equal({});
    });

    it('answers with an empty value for an unknown key', async () => {
        expect(await createServer().getStorageValue('my.plugin', undefined)).to.deep.equal({});
    });

    it('rejects changing the deployed plugins', async () => {
        const server = createServer();

        await server.install('my.plugin').then(
            () => expect.fail('should have rejected'),
            error => expect(error.message).to.contain('browser-only'));
        await server.uninstall('theia.a@1.0.0').then(
            () => expect.fail('should have rejected'),
            error => expect(error.message).to.contain('browser-only'));
        await server.enablePlugin('theia.a').then(
            () => expect.fail('should have rejected'),
            error => expect(error.message).to.contain('browser-only'));
        await server.disablePlugin('theia.a').then(
            () => expect.fail('should have rejected'),
            error => expect(error.message).to.contain('browser-only'));
    });
});
