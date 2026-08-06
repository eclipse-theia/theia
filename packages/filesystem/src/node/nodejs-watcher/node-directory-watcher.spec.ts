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
import { EventEmitter } from 'events';
import { FSWatcher } from 'fs';
import { Minimatch } from 'minimatch';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { isWindows } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { DidFilesChangedParams, FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol';
import { DirectoryIdentity, NodeDirectoryWatcher, NodeDirectoryWatcherTimings, NodeWatchRequest, WatchEventListener } from './node-directory-watcher';

const track = temp.track();

const TIMINGS: NodeDirectoryWatcherTimings = {
    changeDelay: 5,
    deleteDelay: 20,
    existencePollDelay: 20,
    deferredDisposalTimeout: 30
};

/** How long to keep listening after the expected changes arrived, to catch any that should not have. */
const SETTLE_DELAY = TIMINGS.deleteDelay * 3;

/** Indexed by `FileChangeType`. */
const CHANGE_NAMES = ['updated', 'added', 'deleted'];

const NO_LOGGING = { verbose: false, info: () => { }, error: () => { } };

/** Replaces the `fs.watch` handle, so that platform behavior no host can reproduce is driven directly. */
class TestWatcher extends NodeDirectoryWatcher {

    /** Set to pretend the watched directory was replaced, which cannot be forced on a real file system. */
    fakeIdentity: DirectoryIdentity | undefined;
    /** Set to exercise the macOS and Windows file name handling on any host. */
    decomposes = false;
    caseSensitive = true;

    protected listener: WatchEventListener | undefined;
    protected handleEmitter: EventEmitter | undefined;
    protected readonly missing = new Deferred<void>();

    /** Resolves once the watcher has found its target missing, so that a test can then create it. */
    readonly whenMissing = this.missing.promise;

    /** Feeds the watcher an event as the platform would. */
    fire(eventType: string, fileName: string | null): void {
        assert.ok(this.listener, 'the watcher has not opened a handle');
        this.listener(eventType, fileName);
    }

    /** Fails the open handle, as Windows does when the watched directory goes away. */
    fail(error: Error): void {
        this.handleEmitter?.emit('error', error);
    }

    protected override get decomposesFileNames(): boolean {
        return this.decomposes;
    }

    protected override get caseSensitiveFileNames(): boolean {
        return this.caseSensitive;
    }

    protected override async readIdentity(): Promise<DirectoryIdentity | undefined> {
        return this.fakeIdentity ?? super.readIdentity();
    }

    protected override async exists(fsPath: string): Promise<boolean> {
        const result = await super.exists(fsPath);
        if (!result && fsPath === this.target) {
            this.missing.resolve();
        }
        return result;
    }

    protected override createWatchHandle(directory: string, listener: WatchEventListener): FSWatcher {
        this.listener = listener;
        this.handleEmitter = new EventEmitter();
        return Object.assign(this.handleEmitter, { close: () => { } }) as unknown as FSWatcher;
    }
}

/**
 * A temporary directory, a watcher on it and the changes its clients were told about. One per test, so that no
 * test depends on what another one left behind.
 */
class Sandbox implements FileSystemWatcherServiceClient {

    readonly root = fs.realpathSync(temp.mkdirSync('node-directory-watcher'));

    protected readonly reports: DidFilesChangedParams[] = [];
    protected readonly watchers: NodeDirectoryWatcher[] = [];
    protected notify: (() => void) | undefined;

    onDidFilesChanged(report: DidFilesChangedParams): void {
        this.reports.push(report);
        this.notify?.();
    }

    onError(): void { }

    path(...segments: string[]): string {
        return path.resolve(this.root, ...segments);
    }

    write(...segments: string[]): string {
        const target = this.path(...segments);
        fs.writeFileSync(target, 'content');
        return target;
    }

    mkdir(...segments: string[]): string {
        const target = this.path(...segments);
        fs.mkdirSync(target, { recursive: true });
        return target;
    }

    remove(...segments: string[]): void {
        fs.removeSync(this.path(...segments));
    }

    /** A request for every direct child of a directory. */
    directory(clientId: number, directoryPath = this.root, ignored: string[] = []): NodeWatchRequest {
        return { clientId, path: directoryPath, ignored: ignored.map(pattern => new Minimatch(pattern, { dot: true })) };
    }

    /** A request for a single file. */
    file(clientId: number, filePath: string, ignored: string[] = []): NodeWatchRequest {
        return { ...this.directory(clientId, filePath, ignored), fileName: path.basename(filePath) };
    }

    /** A watcher whose events the test feeds in, already started. */
    async watching(target: string, ...requests: NodeWatchRequest[]): Promise<TestWatcher> {
        const watcher = this.starting(target, ...requests);
        await watcher.whenStarted;
        return watcher;
    }

    /** A watcher whose events the test feeds in, not yet started. */
    starting(target: string, ...requests: NodeWatchRequest[]): TestWatcher {
        return this.track(new TestWatcher(target, NO_LOGGING, this, TIMINGS), requests);
    }

    /** A watcher driven by a real `fs.watch` handle, already started. */
    async watchingForReal(target: string, ...requests: NodeWatchRequest[]): Promise<NodeDirectoryWatcher> {
        const watcher = this.track(new NodeDirectoryWatcher(target, NO_LOGGING, this, TIMINGS), requests);
        await watcher.whenStarted;
        return watcher;
    }

    /** What a client was told, as `'<change> <path relative to the root>'`, the root itself being `'.'`. */
    reported(clientId: number): string[] {
        return this.reports
            .filter(report => report.clients?.includes(clientId))
            .flatMap(report => report.changes)
            .map(change => {
                const relative = path.relative(this.root, FileUri.fsPath(change.uri)).split(path.sep).join('/');
                return `${CHANGE_NAMES[change.type]} ${relative || '.'}`;
            });
    }

    /** Waits for the client to have been told exactly this, and for a moment longer to catch anything extra. */
    async expect(clientId: number, ...expected: string[]): Promise<void> {
        await this.settle(() => this.reported(clientId).length >= expected.length);
        assert.deepStrictEqual(this.reported(clientId), expected);
    }

    /** Waits for the client to have been told at least this, tolerating whatever else the platform reports. */
    async expectAmong(clientId: number, ...expected: string[]): Promise<void> {
        await this.settle(() => expected.every(entry => this.reported(clientId).includes(entry)));
        expected.forEach(entry => assert.ok(this.reported(clientId).includes(entry),
            `expected "${entry}" among ${JSON.stringify(this.reported(clientId))}`));
    }

    dispose(): void {
        this.watchers.splice(0).forEach(watcher => watcher.dispose());
    }

    protected track<T extends NodeDirectoryWatcher>(watcher: T, requests: NodeWatchRequest[]): T {
        this.watchers.push(watcher);
        requests.forEach((request, index) => watcher.addRequest(index, request));
        return watcher;
    }

    protected async settle(reached: () => boolean): Promise<void> {
        const deadline = Date.now() + 5000;
        while (!reached() && Date.now() < deadline) {
            await new Promise<void>(resolve => {
                this.notify = resolve;
                setTimeout(resolve, 5);
            });
            this.notify = undefined;
        }
        await new Promise(resolve => setTimeout(resolve, SETTLE_DELAY));
    }
}

describe('node-directory-watcher', function (): void {

    this.timeout(20000);

    const sandboxes: Sandbox[] = [];

    function sandbox(): Sandbox {
        const box = new Sandbox();
        sandboxes.push(box);
        return box;
    }

    afterEach(() => {
        sandboxes.splice(0).forEach(box => box.dispose());
        track.cleanupSync();
    });

    describe('resolving changes', () => {

        it('reports a new direct child as added, and a known one as updated', async () => {
            const box = sandbox();
            const watcher = await box.watching(box.root, box.directory(1));

            box.write('a.txt');
            watcher.fire('rename', 'a.txt');
            await box.expect(1, 'added a.txt');

            watcher.fire('rename', 'a.txt');
            await box.expect(1, 'added a.txt', 'updated a.txt');
        });

        it('reports a modification as updated', async () => {
            const box = sandbox();
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory(1));

            watcher.fire('change', 'a.txt');

            await box.expect(1, 'updated a.txt');
        });

        it('reports a deletion only once the grace period passed', async () => {
            const box = sandbox();
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory(1));

            box.remove('a.txt');
            watcher.fire('rename', 'a.txt');
            assert.deepStrictEqual(box.reported(1), [], 'nothing is reported before the grace period');

            await box.expect(1, 'deleted a.txt');
        });

        it('reports an atomic save as an update rather than a deletion', async () => {
            const box = sandbox();
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory(1));

            box.remove('a.txt');
            watcher.fire('rename', 'a.txt');
            box.write('a.txt');

            await box.expect(1, 'updated a.txt');
        });

        it('reports a file that appears and vanishes within the grace period as both', async () => {
            const box = sandbox();
            const watcher = await box.watching(box.root, box.directory(1));

            watcher.fire('rename', 'ghost.txt');

            await box.expect(1, 'added ghost.txt', 'deleted ghost.txt');
        });

        it('rescans when the platform reports a change without a file name', async () => {
            const box = sandbox();
            box.write('gone.txt');
            const watcher = await box.watching(box.root, box.directory(1));

            box.write('new.txt');
            box.remove('gone.txt');
            // eslint-disable-next-line no-null/no-null
            watcher.fire('change', null);

            await box.expect(1, 'added new.txt', 'deleted gone.txt');
        });

        it('reports a deletion once when a rescan settles it before the grace period', async () => {
            const box = sandbox();
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory(1));

            box.remove('a.txt');
            watcher.fire('rename', 'a.txt');
            // eslint-disable-next-line no-null/no-null
            watcher.fire('change', null);

            await box.expect(1, 'deleted a.txt');
        });

        it('ignores an event naming a path below the watched directory', async () => {
            const box = sandbox();
            box.mkdir('nested');
            box.write('nested', 'deep.txt');
            box.write('sentinel.txt');
            const watcher = await box.watching(box.root, box.directory(1));

            watcher.fire('rename', path.join('nested', 'deep.txt'));
            watcher.fire('rename', 'sentinel.txt');

            await box.expect(1, 'updated sentinel.txt');
        });
    });

    describe('routing', () => {

        it('tells a file request about its own file only', async () => {
            const box = sandbox();
            const watcher = await box.watching(box.root, box.file(1, box.path('wanted.txt')));

            box.write('other.txt');
            box.write('wanted.txt');
            watcher.fire('rename', 'other.txt');
            watcher.fire('rename', 'wanted.txt');

            await box.expect(1, 'added wanted.txt');
        });

        it('applies the excludes of each request separately', async () => {
            const box = sandbox();
            const watcher = await box.watching(box.root, box.directory(1, box.root, ['**/node_modules']), box.directory(2));

            box.mkdir('node_modules');
            watcher.fire('rename', 'node_modules');

            await box.expect(2, 'added node_modules');
            await box.expect(1);
        });

        it('tells a client holding overlapping requests once, and other clients independently', async () => {
            const box = sandbox();
            const file = box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory(1), box.file(1, file), box.directory(2));

            watcher.fire('change', 'a.txt');

            await box.expect(1, 'updated a.txt');
            await box.expect(2, 'updated a.txt');
        });

        it('reports changes under the path each request asked for', async () => {
            const box = sandbox();
            const real = box.mkdir('real');
            fs.symlinkSync(real, box.path('link'), isWindows ? 'junction' : 'dir');
            const watcher = await box.watching(real, box.directory(1, real), box.directory(2, box.path('link')));

            box.write('real', 'a.txt');
            watcher.fire('rename', 'a.txt');

            await box.expect(1, 'added real/a.txt');
            await box.expect(2, 'added link/a.txt');
        });

        it('matches a decomposed file name against the composed path a request asked for', async () => {
            const box = sandbox();
            const composed = 'café.txt'.normalize('NFC');
            const watcher = await box.watching(box.root, box.file(1, box.path(composed)));
            watcher.decomposes = true;

            box.write(composed);
            watcher.fire('rename', 'café.txt'.normalize('NFD'));

            await box.expect(1, `added ${composed}`);
        });

        it('matches a file name irrespective of case where the platform does', async () => {
            const box = sandbox();
            const watcher = await box.watching(box.root, box.file(1, box.path('Wanted.txt')));
            watcher.caseSensitive = false;

            box.write('wanted.txt');
            watcher.fire('rename', 'wanted.txt');

            await box.expect(1, 'added Wanted.txt');
        });
    });

    describe('the watched directory', () => {

        it('is reported and watched once it appears', async () => {
            const box = sandbox();
            const target = box.path('later');
            const watcher = box.starting(target, box.directory(1, target));

            await watcher.whenMissing;
            fs.mkdirSync(target);
            await watcher.whenStarted;
            watcher.fire('rename', path.basename(box.write('later', 'a.txt')));

            await box.expect(1, 'added later', 'added later/a.txt');
        });

        it('is the parent when the target turns out to be a file', async () => {
            const box = sandbox();
            const target = box.path('later.txt');
            const watcher = box.starting(target, box.directory(1, target));

            await watcher.whenMissing;
            fs.writeFileSync(target, 'content');
            await watcher.whenStarted;
            box.write('sibling.txt');
            watcher.fire('rename', 'sibling.txt');
            watcher.fire('change', 'later.txt');

            await box.expect(1, 'added later.txt', 'updated later.txt');
        });

        it('is reported as deleted, and its recovery reports what changed meanwhile', async () => {
            const box = sandbox();
            const target = box.mkdir('workspace');
            box.write('workspace', 'before.txt');
            const watcher = await box.watching(target, box.directory(1, target));

            box.remove('workspace');
            watcher.fire('rename', 'workspace');
            box.mkdir('workspace');
            box.write('workspace', 'after.txt');

            await box.expect(1, 'deleted workspace', 'added workspace', 'added workspace/after.txt', 'deleted workspace/before.txt');
        });

        it('keeps working after being replaced while its inode number was reused', async () => {
            const box = sandbox();
            const watcher = await box.watching(box.root, box.directory(1));

            watcher.fakeIdentity = { dev: 1, ino: 2, birthtimeMs: 3 };
            watcher.fire('rename', 'a.txt');
            await box.expect(1, 'deleted .', 'added .');

            box.write('a.txt');
            watcher.fire('rename', 'a.txt');
            await box.expect(1, 'deleted .', 'added .', 'added a.txt');
        });

        it('keeps working after a handle failure, without reporting a change', async () => {
            const box = sandbox();
            const watcher = await box.watching(box.root, box.directory(1));

            watcher.fail(new Error('EPERM'));
            await box.expect(1);

            box.write('a.txt');
            watcher.fire('rename', 'a.txt');
            await box.expect(1, 'added a.txt');
        });
    });

    describe('disposal', () => {

        it('happens once the last request is released', async () => {
            const box = sandbox();
            const watcher = await box.watching(box.root, box.directory(1), box.directory(2));

            watcher.removeRequest(0);
            await new Promise(resolve => setTimeout(resolve, TIMINGS.deferredDisposalTimeout * 2));
            assert.strictEqual(watcher.isDisposed, false, 'a watcher with a request left must stay alive');

            watcher.removeRequest(1);
            await watcher.whenDisposed;
        });

        it('is called off by a request arriving before the deferred timeout', async () => {
            const box = sandbox();
            const watcher = await box.watching(box.root, box.directory(1));

            watcher.removeRequest(0);
            watcher.addRequest(1, box.directory(2));
            await new Promise(resolve => setTimeout(resolve, TIMINGS.deferredDisposalTimeout * 2));

            assert.strictEqual(watcher.isDisposed, false);
        });

        it('silences a deletion that was still pending', async () => {
            const box = sandbox();
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory(1));

            box.remove('a.txt');
            watcher.fire('rename', 'a.txt');
            watcher.dispose();

            await box.expect(1);
        });
    });

    describe('with a real fs.watch handle', () => {

        it('reports direct children and nothing below them', async () => {
            const box = sandbox();
            box.mkdir('nested');
            await box.watchingForReal(box.root, box.directory(1));

            box.write('nested', 'deep.txt');
            box.write('direct.txt');

            await box.expectAmong(1, 'added direct.txt');
            assert.ok(!box.reported(1).includes('added nested/deep.txt'), 'a nested change must not be reported');
        });

        it('reports an update and a deletion of a direct child', async () => {
            const box = sandbox();
            box.write('a.txt');
            await box.watchingForReal(box.root, box.directory(1));

            box.write('a.txt');
            await box.expectAmong(1, 'updated a.txt');

            box.remove('a.txt');
            await box.expectAmong(1, 'deleted a.txt');
        });

        it('reports a single file through its parent directory', async () => {
            const box = sandbox();
            const file = box.write('a.txt');
            await box.watchingForReal(file, box.file(1, file));

            box.write('other.txt');
            box.write('a.txt');

            await box.expectAmong(1, 'updated a.txt');
            assert.ok(!box.reported(1).includes('added other.txt'), 'a sibling must not be reported');
        });
    });
});
