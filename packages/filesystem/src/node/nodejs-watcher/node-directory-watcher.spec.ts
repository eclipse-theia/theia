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
import * as path from 'path';
import * as temp from 'temp';
import * as fs from '@theia/core/shared/fs-extra';
import { EventEmitter } from 'events';
import { FSWatcher } from 'fs';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { isWindows } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { DidFilesChangedParams, FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol';
import { NO_LOGGING, TempDir, WATCHER_TIMINGS as TIMINGS } from '../test/watcher-test-helper';
import { NodeDirectoryWatcher } from './node-directory-watcher';
import { DirectoryWatchRequest } from './watch-request-router';
import { DirectoryIdentity, WatcherHost, WatchEventListener } from './watcher-host';

const track = temp.track();

/** How long to keep listening after the expected changes arrived, to catch any that should not have. */
const SETTLE_DELAY = TIMINGS.deleteDelay * 3;

/** Indexed by `FileChangeType`. */
const CHANGE_NAMES = ['updated', 'added', 'deleted'];

/** Replaces the whole platform boundary, so behaviour no host can reproduce is driven directly. */
class TestHost extends WatcherHost {

    /** Set to pretend the watched directory was replaced, which no real file system will do on cue. */
    fakeIdentity: DirectoryIdentity | undefined;
    /** Set to exercise the macOS and Windows name handling on any host. */
    decomposes = false;
    /** Defaults to what this host really is, so Windows and macOS behave like themselves. */
    caseInsensitive = super.caseInsensitiveFileNames;
    /** Set to make `fs.watch` refuse, as on EACCES or an exhausted handle budget. */
    refuseToOpen = false;

    protected listener: WatchEventListener | undefined;
    protected handleEmitter: EventEmitter | undefined;
    protected readonly missing = new Deferred<void>();
    protected missingTarget: string | undefined;

    /** Resolves once `expectMissing` was told a path and that path was found missing. */
    readonly whenMissing = this.missing.promise;

    expectMissing(target: string): void {
        this.missingTarget = target;
    }

    /** Runs once during the next directory read, to drive an event while a start is mid-flight. */
    duringNextRead: (() => void) | undefined;

    override async readChildren(directory: string): Promise<Set<string>> {
        const during = this.duringNextRead;
        this.duringNextRead = undefined;
        during?.();
        return super.readChildren(directory);
    }

    /** Feeds the watcher an event as the platform would. */
    fire(eventType: string, fileName: string | null): void {
        assert.ok(this.listener, 'the watcher has not opened a handle');
        this.listener(eventType, fileName);
    }

    /** Fails the open handle, as Windows does when the watched directory goes away. */
    fail(error: Error): void {
        this.handleEmitter?.emit('error', error);
    }

    override get caseInsensitiveFileNames(): boolean {
        return this.caseInsensitive;
    }

    /** Applies the network share check on any host, keyed on the target rather than on `/Volumes`. */
    override isUnsupportedTarget(fsPath: string): boolean {
        return fsPath.includes('network-share');
    }

    override normalizeFileName(fileName: string): string {
        return this.decomposes ? fileName.normalize('NFC') : fileName;
    }

    override async readIdentity(directory: string): Promise<DirectoryIdentity | undefined> {
        return this.fakeIdentity ?? super.readIdentity(directory);
    }

    override async exists(fsPath: string): Promise<boolean> {
        const result = await super.exists(fsPath);
        if (!result && fsPath === this.missingTarget) {
            this.missing.resolve();
        }
        return result;
    }

    override watch(directory: string, listener: WatchEventListener): FSWatcher {
        if (this.refuseToOpen) {
            throw new Error('EACCES');
        }
        this.listener = listener;
        this.handleEmitter = new EventEmitter();
        return Object.assign(this.handleEmitter, { close: () => { this.listener = undefined; } }) as unknown as FSWatcher;
    }
}

/** A temporary directory, the watchers on it, and the changes their clients were told about. */
class Sandbox extends TempDir implements FileSystemWatcherServiceClient {

    /** Errors logged by the watchers of this sandbox. */
    readonly errors: unknown[] = [];

    protected readonly logging = { ...NO_LOGGING, error: (message: string) => this.errors.push(message) };
    protected readonly reports: DidFilesChangedParams[] = [];
    /** The platform boundary every watcher of this sandbox shares. */
    readonly host = new TestHost(this.logging);

    protected readonly watchers: NodeDirectoryWatcher[] = [];
    protected notify: (() => void) | undefined;

    constructor() {
        super(fs.realpathSync.native(temp.mkdirSync('node-directory-watcher')));
    }

    onDidFilesChanged(report: DidFilesChangedParams): void {
        this.reports.push(report);
        this.notify?.();
    }

    onError(): void { }

    /**
     * A request for every direct child of a directory. `realPath` is what the provider would have resolved
     * the path to, which only differs when a symlink is involved.
     */
    directory(directoryPath = this.root, clientId = 1, ignored: string[] = [], realPath = directoryPath): DirectoryWatchRequest {
        return { clientId, path: directoryPath, ignored, realPath };
    }

    /** A request for a single file, which resolves to the file rather than to the directory holding it. */
    file(filePath: string, clientId = 1, ignored: string[] = []): DirectoryWatchRequest {
        return { ...this.directory(filePath, clientId, ignored), realPath: filePath };
    }

    /** A watcher whose events the test feeds in, already started. */
    async watching(target = this.root, ...requests: DirectoryWatchRequest[]): Promise<NodeDirectoryWatcher> {
        const watcher = this.starting(target, ...requests);
        await watcher.whenStarted;
        return watcher;
    }

    /** A watcher whose events the test feeds in, not yet started. */
    starting(target = this.root, ...requests: DirectoryWatchRequest[]): NodeDirectoryWatcher {
        return this.track(new NodeDirectoryWatcher(target, this.logging, this, TIMINGS, this.host), requests);
    }

    /** Feeds the watchers of this sandbox an event as the platform would. */
    fire(eventType: string, fileName: string | null): void {
        this.host.fire(eventType, fileName);
    }

    /** A watcher driven by a real `fs.watch` handle, already started. */
    async watchingForReal(target = this.root, ...requests: DirectoryWatchRequest[]): Promise<NodeDirectoryWatcher> {
        const watcher = this.track(new NodeDirectoryWatcher(target, this.logging, this, TIMINGS, new WatcherHost(this.logging)), requests);
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

    protected track<T extends NodeDirectoryWatcher>(watcher: T, requests: DirectoryWatchRequest[]): T {
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
            await box.watching(box.root, box.directory());

            box.write('a.txt');
            box.fire('rename', 'a.txt');
            await box.expect(1, 'added a.txt');

            box.fire('rename', 'a.txt');
            await box.expect(1, 'added a.txt', 'updated a.txt');
        });

        it('reports a modification as updated', async () => {
            box.write('a.txt');
            await box.watching(box.root, box.directory());

            box.fire('change', 'a.txt');

            await box.expect(1, 'updated a.txt');
        });

        it('reports a deletion only once the grace period passed', async () => {
            box.write('a.txt');
            await box.watching(box.root, box.directory());

            box.remove('a.txt');
            box.fire('rename', 'a.txt');
            assert.deepStrictEqual(box.reported(1), [], 'nothing is reported before the grace period');

            await box.expect(1, 'deleted a.txt');
        });

        it('reports an atomic save as an update rather than a deletion', async () => {
            box.write('a.txt');
            await box.watching(box.root, box.directory());

            box.remove('a.txt');
            box.fire('rename', 'a.txt');
            box.write('a.txt');

            await box.expect(1, 'updated a.txt');
        });

        it('reports a file that appears and vanishes within the grace period as both', async () => {
            await box.watching(box.root, box.directory());

            box.fire('rename', 'ghost.txt');

            await box.expect(1, 'added ghost.txt', 'deleted ghost.txt');
        });

        it('rescans when the platform reports a change without a file name', async () => {
            box.write('gone.txt');
            await box.watching(box.root, box.directory());

            box.write('new.txt');
            box.remove('gone.txt');
            // eslint-disable-next-line no-null/no-null
            box.fire('change', null);

            await box.expect(1, 'added new.txt', 'deleted gone.txt');
        });

        it('reports a deletion once when a rescan settles it before the grace period', async () => {
            box.write('a.txt');
            await box.watching(box.root, box.directory());

            box.remove('a.txt');
            box.fire('rename', 'a.txt');
            // eslint-disable-next-line no-null/no-null
            box.fire('change', null);

            await box.expect(1, 'deleted a.txt');
        });

        it('reports a change to an unknown child as added, and keeps it known', async () => {
            await box.watching(box.root, box.directory());

            // A file the snapshot never saw, as happens when it changes while the directory is being read.
            box.write('late.txt');
            box.fire('change', 'late.txt');
            await box.expect(1, 'added late.txt');

            // Now known, so losing it is a plain deletion rather than an appearance out of nowhere.
            box.remove('late.txt');
            box.fire('rename', 'late.txt');
            await box.expect(1, 'added late.txt', 'deleted late.txt');
        });

        it('ignores an event naming a path below the watched directory', async () => {
            box.mkdir('nested');
            box.write('nested', 'deep.txt');
            box.write('sentinel.txt');
            await box.watching(box.root, box.directory());

            box.fire('rename', path.join('nested', 'deep.txt'));
            box.fire('rename', 'sentinel.txt');

            await box.expect(1, 'updated sentinel.txt');
        });
    });

    describe('routing', () => {

        it('tells a file request about its own file only', async () => {
            await box.watching(box.root, box.file(box.path('wanted.txt')));

            box.write('other.txt');
            box.write('wanted.txt');
            box.fire('rename', 'other.txt');
            box.fire('rename', 'wanted.txt');

            await box.expect(1, 'added wanted.txt');
        });

        it('applies the excludes of each request separately', async () => {
            await box.watching(box.root, box.directory(box.root, 1, ['**/node_modules']), box.directory(box.root, 2));

            box.mkdir('node_modules');
            box.fire('rename', 'node_modules');

            await box.expect(2, 'added node_modules');
            await box.expect(1);
        });

        it('does not apply the excludes of a request to the path it asked to watch', async () => {
            const file = box.write('a.txt');
            await box.watching(box.root, box.file(file, 1, ['**/a.txt']));

            box.fire('change', 'a.txt');

            await box.expect(1, 'updated a.txt');
        });

        it('tells a client holding overlapping requests once, and other clients independently', async () => {
            const file = box.write('a.txt');
            await box.watching(box.root, box.directory(), box.file(file), box.directory(box.root, 2));

            box.fire('change', 'a.txt');

            await box.expect(1, 'updated a.txt');
            await box.expect(2, 'updated a.txt');
        });

        it('reports changes under the path each request asked for', async () => {
            const real = box.mkdir('real');
            fs.symlinkSync(real, box.path('link'), isWindows ? 'junction' : 'dir');
            await box.watching(real, box.directory(real), box.directory(box.path('link'), 2, [], real));

            box.write('real', 'a.txt');
            box.fire('rename', 'a.txt');

            await box.expect(1, 'added real/a.txt');
            await box.expect(2, 'added link/a.txt');
        });

        it('matches a decomposed file name against the composed path a request asked for', async () => {
            const composed = 'café.txt'.normalize('NFC');
            await box.watching(box.root, box.file(box.path(composed)));
            box.host.decomposes = true;

            box.write(composed);
            box.fire('rename', 'café.txt'.normalize('NFD'));

            await box.expect(1, `added ${composed}`);
        });

        it('matches a file name irrespective of case where the platform does', async () => {
            await box.watching(box.root, box.file(box.path('Wanted.txt')));
            box.host.caseInsensitive = true;

            box.write('wanted.txt');
            box.fire('rename', 'wanted.txt');

            await box.expect(1, 'added Wanted.txt');
        });
    });

    describe('the watched directory', () => {

        it('is reported and watched once it appears', async () => {
            const target = box.path('later');
            box.host.expectMissing(target);
            const watcher = box.starting(target, box.directory(target));

            await box.host.whenMissing;
            fs.mkdirSync(target);
            await watcher.whenStarted;
            box.fire('rename', path.basename(box.write('later', 'a.txt')));

            await box.expect(1, 'added later', 'added later/a.txt');
        });

        it('is the parent when the target turns out to be a file', async () => {
            const target = box.path('later.txt');
            box.host.expectMissing(target);
            const watcher = box.starting(target, box.directory(target));

            await box.host.whenMissing;
            fs.writeFileSync(target, 'content');
            await watcher.whenStarted;
            box.write('sibling.txt');
            box.fire('rename', 'sibling.txt');
            box.fire('change', 'later.txt');

            await box.expect(1, 'added later.txt', 'updated later.txt');
        });

        it('is reported as deleted, and its recovery reports what changed meanwhile', async () => {
            const target = box.mkdir('workspace');
            box.write('workspace', 'before.txt');
            await box.watching(target, box.directory(target));

            box.remove('workspace');
            box.fire('rename', 'workspace');
            await box.expect(1, 'deleted workspace');

            box.mkdir('workspace');
            box.write('workspace', 'after.txt');

            await box.expect(1, 'deleted workspace', 'added workspace', 'added workspace/after.txt', 'deleted workspace/before.txt');
        });

        it('is not lost when an event names it, as macOS reports any change inside it', async () => {
            box.write('a.txt');
            await box.watching(box.root, box.directory());

            // libuv names an event on the directory after the directory itself.
            box.fire('rename', path.basename(box.root));
            box.fire('change', 'a.txt');

            await box.expect(1, 'updated a.txt');
        });

        it('keeps working after being replaced while its inode number was reused', async () => {
            await box.watching(box.root, box.directory());

            box.host.fakeIdentity = { dev: 1, ino: 2, birthtimeMs: 3 };
            box.fire('rename', 'a.txt');
            await box.expect(1, 'deleted .', 'added .');

            box.write('a.txt');
            box.fire('rename', 'a.txt');
            await box.expect(1, 'deleted .', 'added .', 'added a.txt');
        });

        it('reports a handle that will not open once, then recovers when it does', async () => {
            const watcher = box.starting(box.root);
            box.host.refuseToOpen = true;

            // Several poll rounds, one report.
            await new Promise(resolve => setTimeout(resolve, TIMINGS.existencePollDelay * 4));
            assert.strictEqual(box.errors.length, 1, `expected one report, got ${JSON.stringify(box.errors)}`);

            box.host.refuseToOpen = false;
            watcher.addRequest(0, box.directory());
            await watcher.whenStarted;
            box.write('a.txt');
            box.fire('rename', 'a.txt');

            await box.expect(1, 'added a.txt');
        });

        it('recovers when the handle fails again while it is still restarting', async () => {
            await box.watching(box.root, box.directory());

            // The second failure lands inside the restart's snapshot. A flag guarding the restart would
            // decline this one and leave the watcher holding a dead handle for good.
            box.host.duringNextRead = () => box.host.fail(new Error('EPERM'));
            box.host.fail(new Error('EPERM'));
            await new Promise(resolve => setTimeout(resolve, TIMINGS.existencePollDelay * 5));

            box.write('a.txt');
            box.fire('rename', 'a.txt');
            await box.expectAmong(1, 'added a.txt');
        });

        it('keeps working after a handle failure, without reporting a change', async () => {
            await box.watching(box.root, box.directory());

            box.host.fail(new Error('EPERM'));
            await box.expect(1);

            box.write('a.txt');
            box.fire('rename', 'a.txt');
            await box.expect(1, 'added a.txt');
        });
    });

    describe('platform behavior', () => {

        it('reports a rename that only changes case as an addition and a deletion', async () => {
            box.write('foo.txt');
            await box.watching(box.root, box.directory());
            box.host.caseInsensitive = true;

            fs.renameSync(box.path('foo.txt'), box.path('Foo.txt'));
            box.fire('rename', 'foo.txt');
            box.fire('rename', 'Foo.txt');

            await box.expect(1, 'added Foo.txt', 'deleted foo.txt');
        });

        it('rejects a timing that would silently become 1ms', () => {
            assert.throws(() => new NodeDirectoryWatcher(box.root, NO_LOGGING, box, { ...TIMINGS, deleteDelay: 0 }), /positive number/);
            assert.throws(() => new NodeDirectoryWatcher(box.root, NO_LOGGING, box, { ...TIMINGS, changeDelay: -1 }), /positive number/);
        });

        it('refuses to watch a network share, which crashes macOS', async () => {
            const target = box.mkdir('network-share');
            const watcher = box.starting(target, box.directory(target));

            await watcher.whenStarted;

            assert.strictEqual(box.errors.length, 1, `expected a report, got ${JSON.stringify(box.errors)}`);
            assert.throws(() => box.fire('change', 'a.txt'), /has not opened a handle/);
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
            box.fire('rename', 'a.txt');
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
