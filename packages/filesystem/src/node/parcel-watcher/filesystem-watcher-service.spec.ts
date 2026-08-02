// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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

import * as assert from 'assert';
import * as path from 'path';
import * as temp from 'temp';
import * as fs from '@theia/core/shared/fs-extra';
import { isWindows } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { NodeDirectoryWatcher, NodeDirectoryWatcherTimings } from '../nodejs-watcher/node-directory-watcher';
import { WatcherInstance, FileSystemWatcherServiceImpl, ParcelFileSystemWatcherService, ParcelWatcher, ParcelWatcherOptions } from './parcel-filesystem-service';
import { WatchOptions } from '../../common/filesystem-watcher-protocol';

const track = temp.track();

const TEST_TIMINGS: NodeDirectoryWatcherTimings = {
    changeDelay: 5,
    deleteDelay: 20,
    existencePollDelay: 20,
    deferredDisposalTimeout: 30
};

class TestService extends FileSystemWatcherServiceImpl {

    get keys(): string[] {
        return Array.from(this.watchers.keys());
    }

    get liveWatchers(): WatcherInstance[] {
        return Array.from(this.watchers.values());
    }

    watcherOf(watcherId: number): WatcherInstance | undefined {
        return this.watcherHandles.get(watcherId)?.watcher;
    }

    protected override createDirectoryWatcher(directory: string): NodeDirectoryWatcher {
        return new NodeDirectoryWatcher(directory, this.options, this.maybeClient, TEST_TIMINGS);
    }

    protected override createWatcher(clientId: number, fsPath: string, options: WatchOptions): ParcelWatcher {
        const watcherOptions: ParcelWatcherOptions = { ignored: this.compileExcludes(options.ignored), ignorePatterns: options.ignored };
        return new ParcelWatcher(clientId, fsPath, watcherOptions, this.options, this.maybeClient, TEST_TIMINGS.deferredDisposalTimeout);
    }
}

describe('filesystem-watcher-service', function (): void {

    this.timeout(20000);

    let root: string;
    let service: TestService;
    let watcherIds: number[];

    beforeEach(() => {
        root = fs.realpathSync(temp.mkdirSync('filesystem-watcher-service'));
        service = new TestService({ verbose: false, info: () => { }, error: () => { } });
        watcherIds = [];
    });

    afterEach(async () => {
        const pending = watcherIds.filter(watcherId => service.watcherOf(watcherId) !== undefined);
        const watchers = service.liveWatchers;
        await Promise.all(pending.map(watcherId => service.unwatchFileChanges(watcherId)));
        await Promise.all(watchers.map(watcher => watcher.whenDisposed));
        track.cleanupSync();
    });

    function uriOf(...segments: string[]): string {
        return FileUri.create(path.resolve(root, ...segments)).toString();
    }

    async function watch(uri: string, options?: WatchOptions): Promise<number> {
        const watcherId = await service.watchFileChanges(1, uri, options);
        watcherIds.push(watcherId);
        return watcherId;
    }

    describe('routing', () => {

        it('keeps the deprecated service name usable by adopters', () => {
            assert.strictEqual(ParcelFileSystemWatcherService, FileSystemWatcherServiceImpl);
        });

        it('serves a recursive request with the parcel watcher', async () => {
            const watcherId = await watch(uriOf(), { ignored: [], recursive: true });
            assert.ok(service.watcherOf(watcherId) instanceof ParcelWatcher);
        });

        it('serves a request without an explicit mode with the parcel watcher', async () => {
            const watcherId = await watch(uriOf(), { ignored: [] });
            assert.ok(service.watcherOf(watcherId) instanceof ParcelWatcher);
        });

        it('serves a non-recursive request with a directory watcher', async () => {
            const watcherId = await watch(uriOf(), { ignored: [], recursive: false });
            assert.ok(service.watcherOf(watcherId) instanceof NodeDirectoryWatcher);
        });

        it('keeps a recursive and a non-recursive request on the same path apart', async () => {
            const recursive = await watch(uriOf(), { ignored: [], recursive: true });
            const nonRecursive = await watch(uriOf(), { ignored: [], recursive: false });

            assert.notStrictEqual(service.watcherOf(recursive), service.watcherOf(nonRecursive));
            assert.strictEqual(service.keys.length, 2);
        });
    });

    describe('sharing', () => {

        it('shares one watcher between a directory and the files inside it', async () => {
            fs.writeFileSync(path.resolve(root, 'a.txt'), 'a');
            fs.writeFileSync(path.resolve(root, 'b.txt'), 'b');

            const directory = await watch(uriOf(), { ignored: [], recursive: false });
            const first = await watch(uriOf('a.txt'), { ignored: [], recursive: false });
            const second = await watch(uriOf('b.txt'), { ignored: [], recursive: false });

            assert.strictEqual(service.keys.length, 1);
            assert.strictEqual(service.watcherOf(directory), service.watcherOf(first));
            assert.strictEqual(service.watcherOf(first), service.watcherOf(second));
        });

        it('shares one watcher between requests with different excludes', async () => {
            await watch(uriOf(), { ignored: ['**/node_modules'], recursive: false });
            await watch(uriOf(), { ignored: [], recursive: false });

            assert.strictEqual(service.keys.length, 1);
        });

        it('shares one watcher between a directory and a symbolic link to it', async () => {
            const real = path.resolve(root, 'real');
            const link = path.resolve(root, 'link');
            fs.mkdirSync(real);
            fs.symlinkSync(real, link, isWindows ? 'junction' : 'dir');

            const direct = await watch(uriOf('real'), { ignored: [], recursive: false });
            const linked = await watch(uriOf('link'), { ignored: [], recursive: false });

            assert.strictEqual(service.keys.length, 1);
            assert.strictEqual(service.watcherOf(direct), service.watcherOf(linked));
        });

        it('shares one watcher between concurrent requests for the same directory', async () => {
            fs.writeFileSync(path.resolve(root, 'a.txt'), 'a');
            fs.writeFileSync(path.resolve(root, 'b.txt'), 'b');

            const [first, second] = await Promise.all([
                watch(uriOf('a.txt'), { ignored: [], recursive: false }),
                watch(uriOf('b.txt'), { ignored: [], recursive: false })
            ]);

            assert.strictEqual(service.keys.length, 1);
            assert.strictEqual(service.watcherOf(first), service.watcherOf(second));
        });

        it('does not attach a request to a watcher that is already disposed', async () => {
            const first = await watch(uriOf(), { ignored: [], recursive: false });
            const disposed = service.watcherOf(first) as NodeDirectoryWatcher;
            disposed.dispose();

            const second = await watch(uriOf(), { ignored: [], recursive: false });

            assert.notStrictEqual(service.watcherOf(second), disposed);
            assert.strictEqual(service.keys.length, 1);
        });
    });

    describe('releasing', () => {

        it('disposes a directory watcher once its last request is unwatched', async () => {
            const first = await watch(uriOf(), { ignored: [], recursive: false });
            const second = await watch(uriOf(), { ignored: [], recursive: false });
            const watcher = service.watcherOf(first) as NodeDirectoryWatcher;

            await service.unwatchFileChanges(first);
            await new Promise(resolve => setTimeout(resolve, TEST_TIMINGS.deferredDisposalTimeout * 2));
            assert.strictEqual(watcher.isDisposed, false, 'the remaining request must keep the watcher alive');

            await service.unwatchFileChanges(second);
            await watcher.whenDisposed;
            assert.strictEqual(service.keys.length, 0);
        });

        it('releases the client reference of a recursive watcher', async () => {
            const watcherId = await watch(uriOf(), { ignored: [], recursive: true });
            const watcher = service.watcherOf(watcherId) as ParcelWatcher;

            await service.unwatchFileChanges(watcherId);
            await watcher.whenDisposed;

            assert.strictEqual(service.keys.length, 0);
        });
    });
});
