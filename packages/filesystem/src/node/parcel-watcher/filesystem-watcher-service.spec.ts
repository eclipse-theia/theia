// *****************************************************************************
// Copyright (C) 2026 Ehab Younes and others.
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
import * as temp from 'temp';
import * as fs from '@theia/core/shared/fs-extra';
import { isWindows } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { DirectoryWatcherProvider, NodeDirectoryWatcher } from '../nodejs-watcher/node-directory-watcher';
import { NO_LOGGING, TempDir, WATCHER_TIMINGS as TIMINGS } from '../test/watcher-test-helper';
import { FileSystemWatcher, WatcherProvider } from '../filesystem-watcher';
import {
    FileSystemWatcherServiceImpl, ParcelFileSystemWatcherServerOptions, ParcelFileSystemWatcherService, ParcelWatcher, RecursiveWatcherProvider
} from './parcel-filesystem-service';
import { WatchOptions } from '../../common/filesystem-watcher-protocol';

const track = temp.track();

const RECURSIVE: Readonly<WatchOptions> = { ignored: [], recursive: true };
const NON_RECURSIVE: Readonly<WatchOptions> = { ignored: [], recursive: false };

/** Exposes what a provider allocated, so that a test can tell sharing from double-allocation. */
interface TestProvider extends WatcherProvider {
    readonly allocated: readonly FileSystemWatcher[];
}

class TestDirectoryProvider extends DirectoryWatcherProvider implements TestProvider {
    get allocated(): readonly FileSystemWatcher[] {
        return this.activeWatchers;
    }
}

class TestRecursiveProvider extends RecursiveWatcherProvider implements TestProvider {
    get allocated(): readonly FileSystemWatcher[] {
        return this.activeWatchers;
    }
}

function isTestProvider(provider: WatcherProvider): provider is TestProvider {
    return provider instanceof TestDirectoryProvider || provider instanceof TestRecursiveProvider;
}

/** A temporary directory and a watcher service on it, one per test. */
class Sandbox extends FileSystemWatcherServiceImpl {

    /** The directory the requests of this test point into. */
    readonly files = new TempDir(fs.realpathSync.native(temp.mkdirSync('filesystem-watcher-service')));

    protected readonly requested: number[] = [];

    constructor() {
        super(NO_LOGGING);
    }

    get root(): string {
        return this.files.root;
    }

    watch(fsPath: string, options: WatchOptions): Promise<number> {
        return this.watchFileChanges(1, FileUri.create(fsPath).toString(), options)
            .then(watcherId => (this.requested.push(watcherId), watcherId));
    }

    /** The watchers currently allocated, one per distinct key, across both providers. */
    get allocated(): readonly FileSystemWatcher[] {
        return this.providers.filter(isTestProvider).flatMap(provider => provider.allocated);
    }

    watcherOf(watcherId: number): FileSystemWatcher | undefined {
        return this.watchersByRequest.get(watcherId);
    }

    async release(): Promise<void> {
        const outstanding = this.requested.splice(0).filter(watcherId => this.watcherOf(watcherId));
        const allocated = this.allocated;
        await Promise.all(outstanding.map(watcherId => this.unwatchFileChanges(watcherId)));
        await Promise.all(allocated.map(watcher => watcher.whenDisposed));
    }

    protected override createProviders(options: ParcelFileSystemWatcherServerOptions): WatcherProvider[] {
        return [
            new TestRecursiveProvider(options, this.maybeClient, TIMINGS.deferredDisposalTimeout),
            new TestDirectoryProvider(options, this.maybeClient, TIMINGS)
        ];
    }
}

describe('filesystem-watcher-service', function (): void {

    this.timeout(20000);

    let box: Sandbox;

    beforeEach(() => {
        box = new Sandbox();
    });

    afterEach(async () => {
        await box.release();
        track.cleanupSync();
    });

    describe('routing', () => {

        it('keeps the deprecated service name usable by adopters', () => {
            assert.strictEqual(ParcelFileSystemWatcherService, FileSystemWatcherServiceImpl);
        });

        it('serves a recursive request, and one that does not say, with the parcel watcher', async () => {

            const recursive = await box.watch(box.root, RECURSIVE);
            const unspecified = await box.watch(box.files.mkdir('other'), { ignored: [] });

            assert.ok(box.watcherOf(recursive) instanceof ParcelWatcher);
            assert.ok(box.watcherOf(unspecified) instanceof ParcelWatcher);
        });

        it('serves a non-recursive request with a directory watcher', async () => {

            const watcherId = await box.watch(box.root, NON_RECURSIVE);

            assert.ok(box.watcherOf(watcherId) instanceof NodeDirectoryWatcher);
        });

        it('keeps a recursive and a non-recursive request on the same path apart', async () => {

            const recursive = await box.watch(box.root, RECURSIVE);
            const nonRecursive = await box.watch(box.root, NON_RECURSIVE);

            assert.notStrictEqual(box.watcherOf(recursive), box.watcherOf(nonRecursive));
            assert.strictEqual(box.allocated.length, 2);
        });
    });

    describe('sharing', () => {

        it('shares one watcher between a directory and the files inside it', async () => {

            const directory = await box.watch(box.root, NON_RECURSIVE);
            const first = await box.watch(box.files.write('a.txt'), NON_RECURSIVE);
            const second = await box.watch(box.files.write('b.txt'), NON_RECURSIVE);

            assert.strictEqual(box.allocated.length, 1);
            assert.strictEqual(box.watcherOf(directory), box.watcherOf(first));
            assert.strictEqual(box.watcherOf(first), box.watcherOf(second));
        });

        it('shares one watcher between requests with different excludes', async () => {

            await box.watch(box.root, { ignored: ['**/node_modules'], recursive: false });
            await box.watch(box.root, NON_RECURSIVE);

            assert.strictEqual(box.allocated.length, 1);
        });

        it('shares one watcher between a directory and a symbolic link to it', async () => {
            const real = box.files.mkdir('real');
            fs.symlinkSync(real, box.files.path('link'), isWindows ? 'junction' : 'dir');

            const direct = await box.watch(real, NON_RECURSIVE);
            const linked = await box.watch(box.files.path('link'), NON_RECURSIVE);

            assert.strictEqual(box.allocated.length, 1);
            assert.strictEqual(box.watcherOf(direct), box.watcherOf(linked));
        });

        it('shares one watcher between concurrent requests for the same directory', async () => {
            const [first, second] = [box.files.write('a.txt'), box.files.write('b.txt')];

            const [one, two] = await Promise.all([box.watch(first, NON_RECURSIVE), box.watch(second, NON_RECURSIVE)]);

            assert.strictEqual(box.allocated.length, 1);
            assert.strictEqual(box.watcherOf(one), box.watcherOf(two));
        });

        it('does not attach a request to a watcher that is already disposed', async () => {
            const first = await box.watch(box.root, NON_RECURSIVE);
            const disposed = box.watcherOf(first) as NodeDirectoryWatcher;
            disposed.dispose();

            const second = await box.watch(box.root, NON_RECURSIVE);

            assert.notStrictEqual(box.watcherOf(second), disposed);
            assert.strictEqual(box.allocated.length, 1);
        });
    });

    describe('releasing', () => {

        it('disposes a directory watcher once its last request is unwatched', async () => {
            const first = await box.watch(box.root, NON_RECURSIVE);
            const second = await box.watch(box.root, NON_RECURSIVE);
            const watcher = box.watcherOf(first) as NodeDirectoryWatcher;

            await box.unwatchFileChanges(first);
            await new Promise(resolve => setTimeout(resolve, TIMINGS.deferredDisposalTimeout * 2));
            assert.strictEqual(watcher.isDisposed, false, 'the remaining request must keep the watcher alive');

            await box.unwatchFileChanges(second);
            await watcher.whenDisposed;
            assert.strictEqual(box.allocated.length, 0);
        });

        it('releases the client reference of a recursive watcher', async () => {
            const watcherId = await box.watch(box.root, RECURSIVE);
            const watcher = box.watcherOf(watcherId) as ParcelWatcher;

            await box.unwatchFileChanges(watcherId);
            await watcher.whenDisposed;

            assert.strictEqual(box.allocated.length, 0);
        });
    });
});
