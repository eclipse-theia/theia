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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// `FileService` transitively imports browser modules that touch `document` at load time.
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { ILogger } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { MockEnvVariablesServerImpl } from '@theia/core/lib/browser/test/mock-env-variables-server';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileOperationError, FileOperationResult } from '@theia/filesystem/lib/common/files';
import { PluginPathsService } from '../../main/common/plugin-paths-protocol.js';
import { BrowserOnlyPluginServer } from './browser-only-plugin-server.js';
import { installFakeLockManager as installNavigatorLocks } from './test/navigator-locks-test-util.js';

disableJSDOM();

/** In-memory stand-in for the browser-local file system. */
class FakeFileService {
    readonly files = new Map<string, string>();
    /**
     * Number of upcoming writes that fail, e.g. because the quota is exceeded. Like OPFS, a
     * failed write leaves the file empty.
     */
    writesToFail = 0;

    async readFile(uri: URI): Promise<{ value: BinaryBuffer }> {
        const content = this.files.get(uri.toString());
        if (content === undefined) {
            throw new FileOperationError(`Unable to read file '${uri.toString()}'`, FileOperationResult.FILE_NOT_FOUND);
        }
        return { value: BinaryBuffer.fromString(content) };
    }

    async writeFile(uri: URI, content: BinaryBuffer): Promise<void> {
        if (this.writesToFail > 0) {
            this.writesToFail--;
            this.files.set(uri.toString(), '');
            throw new Error('QuotaExceededError');
        }
        this.files.set(uri.toString(), content.toString());
    }

    read(uri: string): unknown {
        const content = this.files.get(uri);
        return content === undefined ? undefined : JSON.parse(content);
    }
}

const GLOBAL_STATE_URI = 'file:///.theia/plugin-storage/global-state.json';

const pluginPathsService: PluginPathsService = {
    getHostLogPath: async () => '/logs/host',
    getHostStoragePath: async workspaceUri => workspaceUri && `/workspace-storage/${workspaceUri}`
};

/**
 * Stand-in for the browser's `LockManager`. Like the real one, it runs requests for the same
 * lock name one after another.
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

    let fileService: FakeFileService;

    function createServer(): BrowserOnlyPluginServer {
        const container = new Container();
        container.bind(BrowserOnlyPluginServer).toSelf().inSingletonScope();
        container.bind(ILogger).to(MockLogger);
        container.bind(FileService).toConstantValue(fileService as unknown as FileService);
        container.bind(EnvVariablesServer).toConstantValue(new MockEnvVariablesServerImpl(new URI('file:///.theia')));
        container.bind(PluginPathsService).toConstantValue(pluginPathsService);
        return container.get(BrowserOnlyPluginServer);
    }

    beforeEach(() => {
        fileService = new FakeFileService();
    });

    it('keeps global state across sessions', async () => {
        expect(await createServer().setStorageValue('my.plugin', { count: 1 }, undefined)).to.be.true;

        // a fresh server stands for the next session, reading from the same files
        expect(await createServer().getStorageValue('my.plugin', undefined)).to.deep.equal({ count: 1 });
    });

    it('answers with no values when the file cannot be read, but fails to save', async () => {
        fileService.readFile = async () => {
            throw new Error('STAT_FAILED');
        };
        const server = createServer();

        expect(await server.getAllStorageValues(undefined)).to.deep.equal({});
        await server.setStorageValue('my.plugin', { count: 1 }, undefined).then(
            () => expect.fail('should have rejected'),
            error => expect(error.message).to.contain('STAT_FAILED'));
    });

    it('fails to save a value that cannot be written', async () => {
        fileService.writesToFail = Number.POSITIVE_INFINITY;

        await createServer().setStorageValue('my.plugin', { count: 1 }, undefined).then(
            () => expect.fail('should have rejected'),
            error => expect(error.message).to.contain('QuotaExceededError'));
    });

    it('keeps the values stored before a write that fails', async () => {
        await createServer().setStorageValue('plugin.one', { count: 1 }, undefined);
        fileService.writesToFail = 1;

        await createServer().setStorageValue('plugin.other', { count: 2 }, undefined).then(
            () => expect.fail('should have rejected'),
            error => expect(error.message).to.contain('QuotaExceededError'));

        expect(fileService.read(GLOBAL_STATE_URI)).to.deep.equal({ 'plugin.one': { count: 1 } });
    });

    it('keeps workspace state per workspace', async () => {
        const server = createServer();
        await server.setStorageValue('my.plugin', { count: 1 }, { workspace: 'file:///a', roots: [] });
        await server.setStorageValue('my.plugin', { count: 2 }, { workspace: 'file:///b', roots: [] });

        expect(await server.getStorageValue('my.plugin', { workspace: 'file:///a', roots: [] })).to.deep.equal({ count: 1 });
        expect(await server.getStorageValue('my.plugin', { workspace: 'file:///b', roots: [] })).to.deep.equal({ count: 2 });
    });

    it('keeps global and workspace state apart, in files laid out like the backend does', async () => {
        const server = createServer();
        await server.setStorageValue('my.plugin', { scope: 'global' }, undefined);
        await server.setStorageValue('my.plugin', { scope: 'workspace' }, { workspace: 'file:///a', roots: [] });

        expect(await server.getStorageValue('my.plugin', undefined)).to.deep.equal({ scope: 'global' });
        expect(await server.getAllStorageValues({ workspace: 'file:///a', roots: [] })).to.deep.equal({ 'my.plugin': { scope: 'workspace' } });
        expect(fileService.read(GLOBAL_STATE_URI)).to.deep.equal({ 'my.plugin': { scope: 'global' } });
        expect(fileService.read('file:///workspace-storage/file%3A///a/workspace-state.json')).to.deep.equal({ 'my.plugin': { scope: 'workspace' } });
    });

    it('cannot keep workspace state while no workspace is open', async () => {
        const server = createServer();

        expect(await server.setStorageValue('my.plugin', { count: 1 }, { workspace: undefined, roots: [] })).to.be.false;
        expect(await server.getAllStorageValues({ workspace: undefined, roots: [] })).to.deep.equal({});
    });

    it('does not drop what another host stored in the meantime', async () => {
        const one = createServer();
        // stands for another tab of the application, running its own plugin host over the same files
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

    describe('concurrent writes', () => {

        async function assertNeitherUpdateIsLost(one: BrowserOnlyPluginServer, other: BrowserOnlyPluginServer): Promise<void> {
            // start both writes before awaiting either, so they actually overlap
            await Promise.all([
                one.setStorageValue('plugin.one', { count: 1 }, undefined),
                other.setStorageValue('plugin.other', { count: 2 }, undefined)
            ]);

            expect(await createServer().getAllStorageValues(undefined)).to.deep.equal({
                'plugin.one': { count: 1 },
                'plugin.other': { count: 2 }
            });
        }

        it('does not lose either update from two tabs, serialized via the Web Locks API', async () => {
            const restore = installFakeLockManager();
            try {
                // one server per tab, sharing the same files
                await assertNeitherUpdateIsLost(createServer(), createServer());
            } finally {
                restore();
            }
        });

        it('does not lose either update within one tab when the Web Locks API is unavailable', async () => {
            const server = createServer();
            await assertNeitherUpdateIsLost(server, server);
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
