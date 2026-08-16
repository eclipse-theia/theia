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
import { NO_LOGGING, TempDir, WATCHER_TIMINGS as TIMINGS } from '../test/watcher-test-helper';
import { DirectoryIdentity, NodeDirectoryWatcher, NodeWatchRequest, WatchEventListener } from './node-directory-watcher';

const track = temp.track();

/** How long to keep listening after the expected changes arrived, to catch any that should not have. */
const SETTLE_DELAY = TIMINGS.deleteDelay * 3;

/** Indexed by `FileChangeType`. */
const CHANGE_NAMES = ['updated', 'added', 'deleted'];

/** Replaces the `fs.watch` handle, so that platform behavior no host can reproduce is driven directly. */
class TestWatcher extends NodeDirectoryWatcher {

    /** Set to pretend the watched directory was replaced, which cannot be forced on a real file system. */
    fakeIdentity: DirectoryIdentity | undefined;
    /** Set to exercise the macOS and Windows file name handling on any host. */
    decomposes = false;
    caseInsensitive = false;
    /** Set to make `fs.watch` refuse, as on EACCES or an exhausted handle budget. */
    refuseToOpen = false;

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

    protected override normalizeFileName(fileName: string): string {
        return this.decomposes ? fileName.normalize('NFC') : fileName;
    }

    protected override get caseInsensitiveFileNames(): boolean {
        return this.caseInsensitive;
    }

    /** Applies the network share check on any host, keyed on the target rather than on `/Volumes`. */
    protected override get isUnsupportedTarget(): boolean {
        return this.target.includes('network-share');
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
        if (this.refuseToOpen) {
            throw new Error('EACCES');
        }
        this.listener = listener;
        this.handleEmitter = new EventEmitter();
        return Object.assign(this.handleEmitter, { close: () => { } }) as unknown as FSWatcher;
    }
}

/** A temporary directory, the watchers on it, and the changes their clients were told about. */
class Sandbox extends TempDir implements FileSystemWatcherServiceClient {

    /** Errors logged by the watchers of this sandbox. */
    readonly errors: unknown[] = [];

    protected readonly logging = { ...NO_LOGGING, error: (message: string) => this.errors.push(message) };
    protected readonly reports: DidFilesChangedParams[] = [];
    protected readonly watchers: NodeDirectoryWatcher[] = [];
    protected notify: (() => void) | undefined;

    constructor() {
        super(fs.realpathSync(temp.mkdirSync('node-directory-watcher')));
    }

    onDidFilesChanged(report: DidFilesChangedParams): void {
        this.reports.push(report);
        this.notify?.();
    }

    onError(): void { }

    /** A request for every direct child of a directory. */
    directory(directoryPath = this.root, clientId = 1, ignored: string[] = []): NodeWatchRequest {
        return { clientId, path: directoryPath, ignored: ignored.map(pattern => new Minimatch(pattern, { dot: true })) };
    }

    /** A request for a single file. */
    file(filePath: string, clientId = 1, ignored: string[] = []): NodeWatchRequest {
        return { ...this.directory(filePath, clientId, ignored), fileName: path.basename(filePath) };
    }

    /** A watcher whose events the test feeds in, already started. */
    async watching(target = this.root, ...requests: NodeWatchRequest[]): Promise<TestWatcher> {
        const watcher = this.starting(target, ...requests);
        await watcher.whenStarted;
        return watcher;
    }

    /** A watcher whose events the test feeds in, not yet started. */
    starting(target = this.root, ...requests: NodeWatchRequest[]): TestWatcher {
        return this.track(new TestWatcher(target, this.logging, this, TIMINGS), requests);
    }

    /** A watcher driven by a real `fs.watch` handle, already started. */
    async watchingForReal(target = this.root, ...requests: NodeWatchRequest[]): Promise<NodeDirectoryWatcher> {
        const watcher = this.track(new NodeDirectoryWatcher(target, this.logging, this, TIMINGS), requests);
        await watcher.whenStarted;
        return watcher;
    }

    /** What a client was told, as `'<change> <path relative to the root>'`, the root itself being `'.'`. */
    reported(clientId = 1): string[] {
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

    let box: Sandbox;

    beforeEach(() => {
        box = new Sandbox();
    });

    afterEach(() => {
        box.dispose();
        track.cleanupSync();
    });

    describe('resolving changes', () => {

        it('reports a new direct child as added, and a known one as updated', async () => {
            const watcher = await box.watching(box.root, box.directory());

            box.write('a.txt');
            watcher.fire('rename', 'a.txt');
            await box.expect(1, 'added a.txt');

            watcher.fire('rename', 'a.txt');
            await box.expect(1, 'added a.txt', 'updated a.txt');
        });

        it('reports a modification as updated', async () => {
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory());

            watcher.fire('change', 'a.txt');

            await box.expect(1, 'updated a.txt');
        });

        it('reports a deletion only once the grace period passed', async () => {
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory());

            box.remove('a.txt');
            watcher.fire('rename', 'a.txt');
            assert.deepStrictEqual(box.reported(1), [], 'nothing is reported before the grace period');

            await box.expect(1, 'deleted a.txt');
        });

        it('reports an atomic save as an update rather than a deletion', async () => {
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory());

            box.remove('a.txt');
            watcher.fire('rename', 'a.txt');
            box.write('a.txt');

            await box.expect(1, 'updated a.txt');
        });

        it('reports a file that appears and vanishes within the grace period as both', async () => {
            const watcher = await box.watching(box.root, box.directory());

            watcher.fire('rename', 'ghost.txt');

            await box.expect(1, 'added ghost.txt', 'deleted ghost.txt');
        });

        it('rescans when the platform reports a change without a file name', async () => {
            box.write('gone.txt');
            const watcher = await box.watching(box.root, box.directory());

            box.write('new.txt');
            box.remove('gone.txt');
            // eslint-disable-next-line no-null/no-null
            watcher.fire('change', null);

            await box.expect(1, 'added new.txt', 'deleted gone.txt');
        });

        it('reports a deletion once when a rescan settles it before the grace period', async () => {
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory());

            box.remove('a.txt');
            watcher.fire('rename', 'a.txt');
            // eslint-disable-next-line no-null/no-null
            watcher.fire('change', null);

            await box.expect(1, 'deleted a.txt');
        });

        it('ignores an event naming a path below the watched directory', async () => {
            box.mkdir('nested');
            box.write('nested', 'deep.txt');
            box.write('sentinel.txt');
            const watcher = await box.watching(box.root, box.directory());

            watcher.fire('rename', path.join('nested', 'deep.txt'));
            watcher.fire('rename', 'sentinel.txt');

            await box.expect(1, 'updated sentinel.txt');
        });
    });

    describe('routing', () => {

        it('tells a file request about its own file only', async () => {
            const watcher = await box.watching(box.root, box.file(box.path('wanted.txt')));

            box.write('other.txt');
            box.write('wanted.txt');
            watcher.fire('rename', 'other.txt');
            watcher.fire('rename', 'wanted.txt');

            await box.expect(1, 'added wanted.txt');
        });

        it('applies the excludes of each request separately', async () => {
            const watcher = await box.watching(box.root, box.directory(box.root, 1, ['**/node_modules']), box.directory(box.root, 2));

            box.mkdir('node_modules');
            watcher.fire('rename', 'node_modules');

            await box.expect(2, 'added node_modules');
            await box.expect(1);
        });

        it('tells a client holding overlapping requests once, and other clients independently', async () => {
            const file = box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory(), box.file(file), box.directory(box.root, 2));

            watcher.fire('change', 'a.txt');

            await box.expect(1, 'updated a.txt');
            await box.expect(2, 'updated a.txt');
        });

        it('reports changes under the path each request asked for', async () => {
            const real = box.mkdir('real');
            fs.symlinkSync(real, box.path('link'), isWindows ? 'junction' : 'dir');
            const watcher = await box.watching(real, box.directory(real), box.directory(box.path('link'), 2));

            box.write('real', 'a.txt');
            watcher.fire('rename', 'a.txt');

            await box.expect(1, 'added real/a.txt');
            await box.expect(2, 'added link/a.txt');
        });

        it('matches a decomposed file name against the composed path a request asked for', async () => {
            const composed = 'café.txt'.normalize('NFC');
            const watcher = await box.watching(box.root, box.file(box.path(composed)));
            watcher.decomposes = true;

            box.write(composed);
            watcher.fire('rename', 'café.txt'.normalize('NFD'));

            await box.expect(1, `added ${composed}`);
        });

        it('matches a file name irrespective of case where the platform does', async () => {
            const watcher = await box.watching(box.root, box.file(box.path('Wanted.txt')));
            watcher.caseInsensitive = true;

            box.write('wanted.txt');
            watcher.fire('rename', 'wanted.txt');

            await box.expect(1, 'added Wanted.txt');
        });
    });

    describe('the watched directory', () => {

        it('is reported and watched once it appears', async () => {
            const target = box.path('later');
            const watcher = box.starting(target, box.directory(target));

            await watcher.whenMissing;
            fs.mkdirSync(target);
            await watcher.whenStarted;
            watcher.fire('rename', path.basename(box.write('later', 'a.txt')));

            await box.expect(1, 'added later', 'added later/a.txt');
        });

        it('is the parent when the target turns out to be a file', async () => {
            const target = box.path('later.txt');
            const watcher = box.starting(target, box.directory(target));

            await watcher.whenMissing;
            fs.writeFileSync(target, 'content');
            await watcher.whenStarted;
            box.write('sibling.txt');
            watcher.fire('rename', 'sibling.txt');
            watcher.fire('change', 'later.txt');

            await box.expect(1, 'added later.txt', 'updated later.txt');
        });

        it('is reported as deleted, and its recovery reports what changed meanwhile', async () => {
            const target = box.mkdir('workspace');
            box.write('workspace', 'before.txt');
            const watcher = await box.watching(target, box.directory(target));

            box.remove('workspace');
            watcher.fire('rename', 'workspace');
            await box.expect(1, 'deleted workspace');

            box.mkdir('workspace');
            box.write('workspace', 'after.txt');

            await box.expect(1, 'deleted workspace', 'added workspace', 'added workspace/after.txt', 'deleted workspace/before.txt');
        });

        it('is not lost when an event names it, as macOS reports any change inside it', async () => {
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory());

            // libuv names an event on the directory after the directory itself.
            watcher.fire('rename', path.basename(box.root));
            watcher.fire('change', 'a.txt');

            await box.expect(1, 'updated a.txt');
        });

        it('keeps working after being replaced while its inode number was reused', async () => {
            const watcher = await box.watching(box.root, box.directory());

            watcher.fakeIdentity = { dev: 1, ino: 2, birthtimeMs: 3 };
            watcher.fire('rename', 'a.txt');
            await box.expect(1, 'deleted .', 'added .');

            box.write('a.txt');
            watcher.fire('rename', 'a.txt');
            await box.expect(1, 'deleted .', 'added .', 'added a.txt');
        });

        it('reports a handle that will not open once, then recovers when it does', async () => {
            const watcher = box.starting(box.root);
            watcher.refuseToOpen = true;

            // Several poll rounds, one report.
            await new Promise(resolve => setTimeout(resolve, TIMINGS.existencePollDelay * 4));
            assert.strictEqual(box.errors.length, 1, `expected one report, got ${JSON.stringify(box.errors)}`);

            watcher.refuseToOpen = false;
            watcher.addRequest(0, box.directory());
            await watcher.whenStarted;
            box.write('a.txt');
            watcher.fire('rename', 'a.txt');

            await box.expect(1, 'added a.txt');
        });

        it('keeps working after a handle failure, without reporting a change', async () => {
            const watcher = await box.watching(box.root, box.directory());

            watcher.fail(new Error('EPERM'));
            await box.expect(1);

            box.write('a.txt');
            watcher.fire('rename', 'a.txt');
            await box.expect(1, 'added a.txt');
        });
    });

    describe('platform behavior', () => {

        it('reports a rename that only changes case as an addition and a deletion', async () => {
            box.write('foo.txt');
            const watcher = await box.watching(box.root, box.directory());
            watcher.caseInsensitive = true;

            fs.renameSync(box.path('foo.txt'), box.path('Foo.txt'));
            watcher.fire('rename', 'foo.txt');
            watcher.fire('rename', 'Foo.txt');

            await box.expect(1, 'added Foo.txt', 'deleted foo.txt');
        });

        it('refuses to watch a network share, which crashes macOS', async () => {
            const target = box.mkdir('network-share');
            const watcher = box.starting(target, box.directory(target));

            await watcher.whenStarted;

            assert.strictEqual(box.errors.length, 1, `expected a report, got ${JSON.stringify(box.errors)}`);
            assert.throws(() => watcher.fire('change', 'a.txt'), /has not opened a handle/);
        });
    });

    describe('disposal', () => {

        it('happens once the last request is released', async () => {
            const watcher = await box.watching(box.root, box.directory(), box.directory(box.root, 2));

            watcher.removeRequest(0);
            await new Promise(resolve => setTimeout(resolve, TIMINGS.deferredDisposalTimeout * 2));
            assert.strictEqual(watcher.isDisposed, false, 'a watcher with a request left must stay alive');

            watcher.removeRequest(1);
            await watcher.whenDisposed;
        });

        it('is called off by a request arriving before the deferred timeout', async () => {
            const watcher = await box.watching(box.root, box.directory());

            watcher.removeRequest(0);
            watcher.addRequest(1, box.directory(box.root, 2));
            await new Promise(resolve => setTimeout(resolve, TIMINGS.deferredDisposalTimeout * 2));

            assert.strictEqual(watcher.isDisposed, false);
        });

        it('silences a deletion that was still pending', async () => {
            box.write('a.txt');
            const watcher = await box.watching(box.root, box.directory());

            box.remove('a.txt');
            watcher.fire('rename', 'a.txt');
            watcher.dispose();

            await box.expect(1);
        });
    });

    describe('with a real fs.watch handle', () => {

        it('reports direct children and nothing below them', async () => {
            box.mkdir('nested');
            await box.watchingForReal(box.root, box.directory());

            box.write('nested', 'deep.txt');
            box.write('direct.txt');

            await box.expectAmong(1, 'added direct.txt');
            assert.ok(!box.reported(1).includes('added nested/deep.txt'), 'a nested change must not be reported');
        });

        it('reports an update and a deletion of a direct child', async () => {
            box.write('a.txt');
            await box.watchingForReal(box.root, box.directory());

            box.write('a.txt');
            await box.expectAmong(1, 'updated a.txt');

            box.remove('a.txt');
            await box.expectAmong(1, 'deleted a.txt');
        });

        it('resolves a case-only rename against the real file system', async () => {
            box.write('foo.txt');
            await box.watchingForReal(box.root, box.directory());

            // A case-insensitive host would report an update of the old name if `stat` were trusted.
            fs.renameSync(box.path('foo.txt'), box.path('Foo.txt'));

            await box.expectAmong(1, 'added Foo.txt', 'deleted foo.txt');
        });

        it('reports the watched directory being lost and coming back', async () => {
            const target = box.mkdir('workspace');
            box.write('workspace', 'before.txt');
            await box.watchingForReal(target, box.directory(target));

            // Reported as a named event, an event on the directory, or a handle error, depending on the host.
            box.remove('workspace');
            await box.expectAmong(1, 'deleted workspace');

            box.mkdir('workspace');
            box.write('workspace', 'after.txt');

            await box.expectAmong(1, 'added workspace', 'added workspace/after.txt');
        });

        it('reports a single file through its parent directory', async () => {
            const file = box.write('a.txt');
            await box.watchingForReal(file, box.file(file));

            box.write('other.txt');
            box.write('a.txt');

            await box.expectAmong(1, 'updated a.txt');
            assert.ok(!box.reported(1).includes('added other.txt'), 'a sibling must not be reported');
        });
    });
});
