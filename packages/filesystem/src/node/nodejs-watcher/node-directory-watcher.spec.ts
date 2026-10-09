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
import { Deferred, wait } from '@theia/core/lib/common/promise-util';
import { isWindows } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { DidFilesChangedParams, FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol';
import { NO_LOGGING, TempDir, WATCHER_TIMINGS as TIMINGS } from '../test/watcher-test-helper';
import { DirectoryWatcherProvider, NodeDirectoryWatcher } from './node-directory-watcher';
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
    duringNextRead: (() => void | Promise<void>) | undefined;

    /** How many times a directory was read. */
    reads = 0;

    override async readChildren(directory: string): Promise<Set<string>> {
        this.reads++;
        const during = this.duringNextRead;
        this.duringNextRead = undefined;
        await during?.();
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
        await this.warmUp(watcher, target);
        return watcher;
    }

    /**
     * macOS FSEvents starts asynchronously after `fs.watch` returns and drops what happens meanwhile, so keep
     * touching a probe file until a change is delivered, proving the handle live before the test acts.
     */
    protected async warmUp(watcher: NodeDirectoryWatcher, target: string): Promise<void> {
        const directory = fs.statSync(target).isDirectory() ? target : path.dirname(target);
        watcher.addRequest(9999, this.directory(directory, 99));
        const probe = path.join(directory, '.warmup');
        const deadline = Date.now() + 5000;
        while (!this.reported(99).some(entry => entry.includes('.warmup')) && Date.now() < deadline) {
            fs.writeFileSync(probe, 'ping');
            await wait(100);
        }
        fs.removeSync(probe);
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
        await wait(SETTLE_DELAY);
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

        it('reports a modification during the first read as updated, even once its batch was flushed', async () => {
            box.write('a.txt');
            box.host.duringNextRead = async () => {
                box.fire('change', 'a.txt');
                await wait(TIMINGS.changeDelay * 4);
            };
            await box.watching(box.root, box.directory());

            await box.expect(1, 'updated a.txt');
        });

        it('reports a creation during the first read as added, even once its batch was flushed', async () => {
            box.host.duringNextRead = async () => {
                box.write('a.txt');
                box.fire('rename', 'a.txt');
                await wait(TIMINGS.changeDelay * 4);
            };
            await box.watching(box.root, box.directory());

            await box.expect(1, 'added a.txt');
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

        it('still confirms a deletion when another one on its timer is called off', async () => {
            box.write('a.txt');
            box.write('b.txt');
            await box.watching(box.root, box.directory());

            box.remove('a.txt');
            box.remove('b.txt');
            box.fire('rename', 'a.txt');
            box.fire('rename', 'b.txt');
            // After the batch resolved, within the grace period.
            await wait(TIMINGS.changeDelay * 2);
            box.write('a.txt');
            box.fire('rename', 'a.txt');

            await box.expect(1, 'updated a.txt', 'deleted b.txt');
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

            await box.expect(1, 'deleted gone.txt', 'added new.txt');
        });

        it('reports a deletion once when its rename follows a rescan in the same batch', async () => {
            box.write('a.txt');
            await box.watching(box.root, box.directory());

            box.remove('a.txt');
            // eslint-disable-next-line no-null/no-null
            box.fire('change', null);
            box.fire('rename', 'a.txt');

            await box.expect(1, 'deleted a.txt');
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

        it('matches a composed file name against the decomposed path a request resolved to', async () => {
            const decomposed = 'café.txt'.normalize('NFD');
            const file = box.write(decomposed);
            box.host.decomposes = true;
            // `realpath` returns the name as HFS+ stores it, decomposed.
            await box.watching(box.root, box.file(file));

            box.fire('change', decomposed);

            await box.expect(1, `updated ${decomposed}`);
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

        it('is reported once it appears, even when the start that found it is superseded', async () => {
            const target = box.path('later');
            box.host.expectMissing(target);
            box.starting(target, box.directory(target));

            await box.host.whenMissing;
            box.host.duringNextRead = () => box.host.fail(new Error('EPERM'));
            fs.mkdirSync(target);

            await box.expect(1, 'added later');
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

        it('is followed through a symbolic link above it once it appears', async () => {
            const real = box.mkdir('real');
            fs.symlinkSync(real, box.path('link'), isWindows ? 'junction' : 'dir');
            const target = box.path('link', 'later');
            box.host.expectMissing(target);
            // Missing, so the provider could not resolve the link and kept the path as it was asked for.
            const watcher = box.starting(target, box.directory(target));

            await box.host.whenMissing;
            fs.mkdirSync(path.join(real, 'later'));
            await watcher.whenStarted;
            box.write('real', 'later', 'a.txt');
            box.fire('rename', 'a.txt');

            await box.expect(1, 'added link/later', 'added link/later/a.txt');
        });

        it('stays on the parent after the file it was created for is gone', async () => {
            const target = box.path('later.txt');
            box.host.expectMissing(target);
            const watcher = box.starting(target, box.directory(target));

            await box.host.whenMissing;
            fs.writeFileSync(target, 'content');
            await watcher.whenStarted;
            // Stands for a request a re-key merged in once the file appeared.
            watcher.addRequest(1, box.directory(box.root, 2));
            box.remove('later.txt');
            box.host.fail(new Error('EPERM'));
            await wait(TIMINGS.existencePollDelay * 2);

            box.write('after.txt');
            box.fire('rename', 'after.txt');
            await box.expectAmong(2, 'added after.txt');
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

            await box.expect(1, 'deleted workspace', 'added workspace', 'deleted workspace/before.txt', 'added workspace/after.txt');
        });

        it('is reported added once when it turns into a file', async () => {
            const target = box.mkdir('later');
            box.write('later', 'a.txt');
            await box.watching(target, box.directory(target));

            box.remove('later');
            box.write('later');
            box.fire('rename', 'later');

            await box.expect(1, 'deleted later', 'added later');
            assert.deepStrictEqual(box.errors, []);
        });

        it('keeps a file request waiting while it is a file', async () => {
            const directory = box.mkdir('dir');
            const file = box.write('dir', 'f.txt');
            await box.watching(directory, box.file(file));

            box.remove('dir');
            box.write('dir');
            box.fire('rename', 'dir');
            await box.expect(1, 'deleted dir/f.txt');

            box.remove('dir');
            box.mkdir('dir');
            box.write('dir', 'f.txt');
            await box.expect(1, 'deleted dir/f.txt', 'added dir/f.txt');
        });

        it('keeps the file request it was created for waiting while it is a file', async () => {
            box.mkdir('dir');
            const file = box.path('dir', 'f.txt');
            box.host.expectMissing(file);
            const watcher = box.starting(file, box.file(file));
            await box.host.whenMissing;
            box.write('dir', 'f.txt');
            await watcher.whenStarted;

            box.remove('dir');
            box.write('dir');
            box.fire('rename', 'dir');
            await box.expect(1, 'added dir/f.txt', 'deleted dir/f.txt');

            box.remove('dir');
            box.mkdir('dir');
            box.write('dir', 'f.txt');
            await box.expect(1, 'added dir/f.txt', 'deleted dir/f.txt', 'added dir/f.txt');
        });

        it('tells a file request once that its file went with the directory', async () => {
            const target = box.mkdir('workspace');
            const file = box.write('workspace', 'a.txt');
            await box.watching(target, box.directory(target), box.file(file, 2));

            box.remove('workspace');
            box.fire('rename', 'workspace');
            await box.expect(1, 'deleted workspace');
            box.mkdir('workspace');

            await box.expect(1, 'deleted workspace', 'added workspace', 'deleted workspace/a.txt');
            await box.expect(2, 'deleted workspace/a.txt');
        });

        it('tells a file request once about its file across a loss and recovery of the directory', async () => {
            const target = box.mkdir('workspace');
            const file = box.write('workspace', 'a.txt');
            await box.watching(target, box.directory(target), box.file(file, 2));

            box.remove('workspace', 'a.txt');
            box.fire('rename', 'a.txt');
            await box.expectAmong(2, 'deleted workspace/a.txt');

            box.remove('workspace');
            box.fire('rename', 'workspace');
            await box.expectAmong(1, 'deleted workspace');

            box.mkdir('workspace');
            box.write('workspace', 'a.txt');
            await box.expectAmong(1, 'added workspace');
            await box.expect(2, 'deleted workspace/a.txt', 'added workspace/a.txt');
        });

        it('tells a file request once about its file when it is created during the recovery read', async () => {
            const target = box.mkdir('ws');
            const file = box.write('ws', 'a.txt');
            await box.watching(target, box.directory(target), box.file(file, 2));

            box.remove('ws', 'a.txt');
            box.fire('rename', 'a.txt');
            await box.expect(2, 'deleted ws/a.txt');
            box.remove('ws');
            box.fire('rename', 'ws');
            await box.expectAmong(1, 'deleted ws');

            box.host.duringNextRead = () => {
                box.write('ws', 'a.txt');
                box.fire('rename', 'a.txt');
            };
            box.mkdir('ws');

            await box.expect(1, 'deleted ws/a.txt', 'deleted ws', 'added ws', 'added ws/a.txt');
            await box.expect(2, 'deleted ws/a.txt', 'added ws/a.txt');
        });

        it('is reported deleted once when it goes again while its recovery reads it', async () => {
            const target = box.mkdir('ws');
            box.write('ws', 'a.txt');
            await box.watching(target, box.directory(target));
            box.remove('ws');
            box.fire('rename', 'ws');
            await box.expect(1, 'deleted ws');

            box.host.duringNextRead = () => {
                box.remove('ws');
                box.fire('rename', 'ws');
            };
            box.mkdir('ws');
            box.write('ws', 'a.txt');
            await wait(TIMINGS.existencePollDelay * 4);
            box.mkdir('ws');
            box.write('ws', 'a.txt');

            await box.expect(1, 'deleted ws', 'added ws');
        });

        it('tells a file request its file went when the first start finds the directory gone after its read', async () => {
            const target = box.mkdir('ws');
            const file = box.write('ws', 'a.txt');
            box.host.duringNextRead = () => box.remove('ws');
            await box.watching(target, box.directory(target), box.file(file, 2));

            await box.expect(1, 'deleted ws');
            await box.expect(2, 'deleted ws/a.txt');
        });

        it('reports nothing when the first start finds the directory briefly moved away', async () => {
            const target = box.mkdir('ws');
            box.write('ws', 'a.txt');
            const aside = box.path('ws-aside');
            const readIdentity = box.host.readIdentity.bind(box.host);
            box.host.duringNextRead = () => fs.renameSync(target, aside);
            box.host.readIdentity = async directory => {
                const identity = await readIdentity(directory);
                if (!identity && fs.existsSync(aside)) {
                    // Moved back: the same inode and birth time.
                    fs.renameSync(aside, target);
                }
                return identity;
            };
            await box.watching(target, box.directory(target));

            await box.expect(1);
        });

        it('does not report an existing file added when the first read is found moved away', async () => {
            const target = box.mkdir('ws');
            box.write('ws', 'a.txt');
            const readIdentity = box.host.readIdentity.bind(box.host);
            let identityReads = 0;
            box.host.readIdentity = async directory => {
                if (++identityReads !== 2) {
                    return readIdentity(directory);
                }
                // The check after the first read: moved away and back.
                fs.renameSync(target, box.path('ws-aside'));
                const identity = await readIdentity(directory);
                fs.renameSync(box.path('ws-aside'), target);
                return identity;
            };
            box.host.duringNextRead = async () => {
                box.write('ws', 'a.txt');
                box.fire('change', 'a.txt');
                await wait(TIMINGS.changeDelay * 4);
            };
            await box.watching(target, box.directory(target));

            await box.expect(1);
        });

        it('tells an adopted request nothing while the start recovering the directory finds it gone again', async () => {
            const target = box.mkdir('cfg');
            const file = box.write('cfg', 'settings.json');
            const watcher = await box.watching(target, box.directory(target));
            box.remove('cfg');
            box.fire('rename', 'cfg');
            await box.expect(1, 'deleted cfg');

            box.host.duringNextRead = () => {
                watcher.adoptRequests(new Map([[7, box.file(file, 2)]]));
                box.remove('cfg');
            };
            box.mkdir('cfg');
            box.write('cfg', 'settings.json');
            await wait(TIMINGS.existencePollDelay * 6);

            await box.expect(1, 'deleted cfg');
            await box.expect(2);
        });

        it('reports a child once when the start recovering the directory finds it replaced after a batch was queued', async () => {
            const target = box.mkdir('ws');
            await box.watching(target, box.directory(target));
            box.remove('ws');
            box.fire('rename', 'ws');
            await box.expect(1, 'deleted ws');

            box.host.duringNextRead = async () => {
                box.write('ws', 'a.txt');
                box.fire('rename', 'a.txt');
                await wait(TIMINGS.changeDelay * 4);
                fs.renameSync(target, box.path('ws-old'));
                box.mkdir('ws');
                box.write('ws', 'a.txt');
            };
            box.mkdir('ws');

            await box.expect(1, 'deleted ws', 'added ws', 'added ws/a.txt');
        });

        it('opens no handle on its path once that is a file', async () => {
            const target = box.mkdir('later');
            const watcher = await box.watching(target, box.directory(target));
            const resolveTarget = box.host.resolveTarget.bind(box.host);
            box.host.resolveTarget = async fsPath => {
                const resolved = await resolveTarget(fsPath);
                box.host.resolveTarget = resolveTarget;
                // Turns into a file right after it resolved as a directory.
                box.remove('later');
                box.write('later');
                return resolved;
            };
            box.host.fail(new Error('EPERM'));

            await box.expect(1, 'deleted later', 'added later');
            assert.strictEqual(watcher.directory, box.root);
        });

        it('tells a directory request it became a file when a restart finds that out', async () => {
            const target = box.mkdir('later');
            box.write('later', 'a.txt');
            const watcher = await box.watching(target, box.directory(target));

            // The restart's new handle is refused, as on EMFILE, while the directory turns into a file.
            const watch = box.host.watch.bind(box.host);
            box.host.watch = () => {
                box.host.watch = watch;
                box.remove('later');
                box.write('later');
                throw new Error('EMFILE');
            };
            box.host.fail(new Error('EPERM'));

            await box.expect(1, 'deleted later', 'added later');
            assert.strictEqual(watcher.directory, box.root);
        });

        it('reports the changes of the batch that finds it replaced', async () => {
            const target = box.mkdir('ws');
            await box.watching(target, box.directory(target));

            // What inotify reports for: touch ws/a.txt; mv ws ws-old; mkdir ws; touch ws/a.txt
            box.write('ws', 'a.txt');
            fs.renameSync(target, box.path('ws-old'));
            box.mkdir('ws');
            box.write('ws', 'a.txt');
            box.fire('rename', 'a.txt');
            box.fire('rename', 'ws');

            await box.expect(1, 'added ws/a.txt', 'deleted ws', 'added ws');
        });

        it('is noticed as replaced while a start reads it', async () => {
            const target = box.mkdir('ws');
            box.host.duringNextRead = () => {
                // After the handle opened on the old directory. Faked, as a file system can reuse the inode.
                box.host.fakeIdentity = { dev: 1, ino: 2, birthtimeMs: 3 };
                box.fire('rename', 'ws');
            };
            await box.watching(target, box.directory(target));
            await box.expect(1, 'deleted ws', 'added ws');

            box.write('ws', 'a.txt');
            box.fire('rename', 'a.txt');
            await box.expect(1, 'deleted ws', 'added ws', 'added ws/a.txt');
        });

        it('is not lost when an event names it, as macOS reports any change inside it', async () => {
            box.write('a.txt');
            await box.watching(box.root, box.directory());

            // libuv names an event on the directory after the directory itself.
            box.fire('rename', path.basename(box.root));
            box.fire('change', 'a.txt');

            await box.expect(1, 'updated a.txt');
        });

        it('ignores a change event naming it, as for a metadata change on it', async () => {
            box.write('a.txt');
            await box.watching(box.root, box.directory());

            box.fire('change', path.basename(box.root));
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
            await wait(TIMINGS.existencePollDelay * 4);
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
            await wait(TIMINGS.existencePollDelay * 5);

            box.write('a.txt');
            box.fire('rename', 'a.txt');
            await box.expectAmong(1, 'added a.txt');
        });

        it('reports what changed when a restart is superseded before it could report', async () => {
            await box.watching(box.root, box.directory());

            box.host.duringNextRead = () => {
                box.write('a.txt');
                box.host.fail(new Error('EPERM'));
            };
            box.host.fail(new Error('EPERM'));

            await box.expect(1, 'added a.txt');
        });

        it('reports itself added again when the restart that reported it deleted is superseded', async () => {
            await box.watching(box.root, box.directory());

            // The superseded restart stores the new identity, so the next one finds nothing replaced.
            box.host.fakeIdentity = { dev: 1, ino: 2, birthtimeMs: 3 };
            box.host.duringNextRead = () => box.host.fail(new Error('EPERM'));
            box.host.fail(new Error('EPERM'));

            await box.expect(1, 'deleted .', 'added .');
        });

        it('reports a creation once when the restart that read it is superseded after its batch was flushed', async () => {
            await box.watching(box.root, box.directory());

            box.host.duringNextRead = async () => {
                box.write('a.txt');
                box.fire('rename', 'a.txt');
                // Long enough for the batch to be queued behind the restart before the handle fails again.
                await wait(TIMINGS.changeDelay * 4);
                box.host.fail(new Error('EPERM'));
            };
            box.host.fail(new Error('EPERM'));

            await box.expect(1, 'added a.txt');
        });

        it('reports a child after itself when the restart that reported it deleted is superseded', async () => {
            await box.watching(box.root, box.directory());

            box.host.fakeIdentity = { dev: 1, ino: 2, birthtimeMs: 3 };
            box.host.duringNextRead = async () => {
                box.write('a.txt');
                box.fire('rename', 'a.txt');
                await wait(TIMINGS.changeDelay * 4);
                box.host.fail(new Error('EPERM'));
            };
            box.host.fail(new Error('EPERM'));

            await box.expect(1, 'deleted .', 'added .', 'added a.txt');
        });

        it('reports a creation, a deletion, and a replacement as an update once each during a restart read', async () => {
            box.write('b.txt');
            box.write('c.txt');
            await box.watching(box.root, box.directory());

            box.host.duringNextRead = () => {
                box.write('a.txt');
                box.remove('b.txt');
                box.write('b.txt');
                box.remove('c.txt');
                ['a.txt', 'b.txt', 'c.txt'].forEach(fileName => box.fire('rename', fileName));
            };
            box.host.fail(new Error('EPERM'));

            await box.expect(1, 'added a.txt', 'updated b.txt', 'deleted c.txt');
        });

        it('reports a deletion once when the handle fails while its batch is resolved', async () => {
            box.write('a.txt');
            await box.watching(box.root, box.directory());
            // Where names ignore case the batch reads the directory, which lets the failure land mid-batch.
            box.host.caseInsensitive = true;

            box.host.duringNextRead = () => box.host.fail(new Error('EPERM'));
            box.remove('a.txt');
            box.fire('rename', 'a.txt');

            await box.expect(1, 'deleted a.txt');
        });

        it('is re-keyed when a superseded restart already moved it to the parent', async () => {
            const target = box.mkdir('later');
            const watcher = await box.watching(target, box.directory(target));
            let resolved = 0;
            watcher.onDidResolveDirectory(() => resolved++);

            box.remove('later');
            box.write('later');
            box.host.duringNextRead = () => box.host.fail(new Error('EPERM'));
            box.host.fail(new Error('EPERM'));
            await wait(TIMINGS.existencePollDelay * 5);

            assert.strictEqual(watcher.directory, box.root);
            assert.strictEqual(resolved, 1);
        });

        it('reports no change when the handle fails during the first read', async () => {
            box.write('a.txt');
            box.host.duringNextRead = () => box.host.fail(new Error('EPERM'));
            await box.watching(box.root, box.directory());
            await wait(TIMINGS.existencePollDelay * 2);

            box.write('b.txt');
            box.fire('rename', 'b.txt');
            await box.expect(1, 'added b.txt');
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

        it('reports a case-only rename as a deletion and an addition, or as an update to a request for the file', async () => {
            const file = box.write('foo.txt');
            await box.watching(box.root, box.directory(), box.file(file, 2));
            box.host.caseInsensitive = true;

            fs.renameSync(box.path('foo.txt'), box.path('Foo.txt'));
            box.fire('rename', 'foo.txt');
            box.fire('rename', 'Foo.txt');

            await box.expect(1, 'deleted foo.txt', 'added Foo.txt');
            await box.expect(2, 'updated foo.txt');
        });

        it('reports a case-only rename found by a rescan as an update to a request for the file', async () => {
            const file = box.write('foo.txt');
            await box.watching(box.root, box.file(file));
            box.host.caseInsensitive = true;

            fs.renameSync(box.path('foo.txt'), box.path('Foo.txt'));
            // eslint-disable-next-line no-null/no-null
            box.fire('change', null);

            await box.expect(1, 'updated foo.txt');
        });

        it('leaves a request for a file with its file when its case changes over two batches', async () => {
            const file = box.write('foo.txt');
            box.host.caseInsensitive = true;
            // A long grace period, so the deletion of the old name still waits after the first batch on a slow host.
            const watcher = new NodeDirectoryWatcher(box.root, NO_LOGGING, box, { ...TIMINGS, deleteDelay: 1000 }, box.host);
            watcher.addRequest(0, box.file(file));
            watcher.addRequest(1, box.directory(box.root, 2));
            await watcher.whenStarted;
            try {
                fs.renameSync(box.path('foo.txt'), box.path('tmp'));
                box.fire('rename', 'foo.txt');
                box.fire('rename', 'tmp');
                await box.expectAmong(2, 'added tmp');
                fs.renameSync(box.path('tmp'), box.path('Foo.txt'));
                box.fire('rename', 'tmp');
                box.fire('rename', 'Foo.txt');

                await box.expect(1, 'added foo.txt', 'updated foo.txt');
            } finally {
                watcher.dispose();
            }
        });

        it('leaves a request for a file with its file when a rescan finds its case changed', async () => {
            const file = box.write('foo.txt');
            await box.watching(box.root, box.file(file));
            box.host.caseInsensitive = true;

            // The overflow lost the rename; the write that followed it was delivered.
            fs.renameSync(box.path('foo.txt'), box.path('Foo.txt'));
            // eslint-disable-next-line no-null/no-null
            box.fire('change', null);
            box.fire('change', 'Foo.txt');

            await box.expect(1, 'added foo.txt');
        });

        it('tells names that differ only in case apart where a directory does', async function (): Promise<void> {
            box.write('foo.txt');
            if (fs.existsSync(box.path('FOO.TXT'))) {
                // This file system ignores case, so it cannot hold both names.
                this.skip();
            }
            box.write('Foo.txt');
            box.host.caseInsensitive = true;
            await box.watching(box.root, box.directory());

            box.write('foo.txt');
            box.fire('rename', 'foo.txt');
            box.remove('Foo.txt');
            box.fire('rename', 'Foo.txt');

            await box.expect(1, 'updated foo.txt', 'deleted Foo.txt');
        });

        it('reads the directory once for a batch of renames where names ignore case', async () => {
            box.host.caseInsensitive = true;
            await box.watching(box.root, box.directory());
            const readsBefore = box.host.reads;

            ['a.txt', 'b.txt', 'c.txt'].forEach(fileName => {
                box.write(fileName);
                box.fire('rename', fileName);
            });

            await box.expect(1, 'added a.txt', 'added b.txt', 'added c.txt');
            assert.strictEqual(box.host.reads - readsBefore, 1);
        });

        it('confirms the deletions of a batch with one directory read where names ignore case', async () => {
            box.host.caseInsensitive = true;
            const fileNames = ['a.txt', 'b.txt', 'c.txt'];
            fileNames.forEach(fileName => box.write(fileName));
            await box.watching(box.root, box.directory());
            const readsBefore = box.host.reads;

            fileNames.forEach(fileName => {
                box.remove(fileName);
                box.fire('rename', fileName);
            });

            await box.expect(1, 'deleted a.txt', 'deleted b.txt', 'deleted c.txt');
            // One read resolves the batch, one confirms its deletions.
            assert.strictEqual(box.host.reads - readsBefore, 2);
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

    describe('adopting requests', () => {

        it('tells them about their file once a batch queued before them reported it', async () => {
            const watcher = await box.watching(box.root, box.directory());

            box.write('x.txt');
            box.fire('rename', 'x.txt');
            watcher.adoptRequests(new Map([[1, box.file(box.path('x.txt'), 2)]]));

            await box.expect(1, 'added x.txt');
            await box.expect(2, 'added x.txt');
        });

        it('tells only those whose file exists that it was added', async () => {
            const file = box.write('x.txt');
            const watcher = await box.watching(box.root, box.directory());

            watcher.adoptRequests(new Map([[1, box.file(file, 2)], [2, box.file(box.path('missing.txt'), 3)]]));

            await box.expect(2, 'added x.txt');
            await box.expect(3);
            await box.expect(1);
        });

        it('leaves a scheduled disposal alone when there are none', async () => {
            const watcher = await box.watching(box.root, box.directory());

            watcher.removeRequest(0);
            watcher.adoptRequests(new Map());

            await watcher.whenDisposed;
        });

        it('tells a request moved onto a watcher still waiting for its directory about its file once', async () => {
            const provider = new DirectoryWatcherProvider(NO_LOGGING, box, { ...TIMINGS, existencePollDelay: 400 }, box.host);
            const directory = box.path('cfg');
            const file = box.path('cfg', 'settings.json');
            try {
                await provider.watch(0, box.directory(directory));
                await wait(200);
                await provider.watch(1, box.file(file, 2));
                // Both appear right after the directory watcher polled, so the file watcher finds them first.
                const exists = box.host.exists.bind(box.host);
                box.host.exists = async fsPath => {
                    const result = await exists(fsPath);
                    if (!result && fsPath === directory) {
                        box.host.exists = exists;
                        fs.mkdirSync(directory);
                        fs.writeFileSync(file, '{}');
                    }
                    return result;
                };

                await box.expect(1, 'added cfg');
                await box.expect(2, 'added cfg/settings.json');
            } finally {
                provider.unwatch(0);
                provider.unwatch(1);
            }
        });
    });

    describe('disposal', () => {

        it('happens once the last request is released', async () => {
            const watcher = await box.watching(box.root, box.directory(), box.directory(box.root, 2));

            watcher.removeRequest(0);
            await wait(TIMINGS.deferredDisposalTimeout * 2);
            assert.strictEqual(watcher.isDisposed, false, 'a watcher with a request left must stay alive');

            watcher.removeRequest(1);
            await watcher.whenDisposed;
        });

        it('is called off by a request arriving before the deferred timeout', async () => {
            const watcher = await box.watching(box.root, box.directory());

            watcher.removeRequest(0);
            watcher.addRequest(1, box.directory(box.root, 2));
            await wait(TIMINGS.deferredDisposalTimeout * 2);

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

        it('keeps its state in sync while it briefly has no requests', async () => {
            box.write('a.txt');
            const watcher = new NodeDirectoryWatcher(box.root, NO_LOGGING, box, { ...TIMINGS, deferredDisposalTimeout: 1000 }, box.host);
            watcher.addRequest(0, box.directory());
            await watcher.whenStarted;
            try {
                // The file is deleted just as the last request leaves; the grace period keeps the watcher alive.
                box.remove('a.txt');
                box.fire('rename', 'a.txt');
                watcher.removeRequest(0);
                await wait(TIMINGS.deleteDelay * 3);

                // The deletion was settled meanwhile, so the recreated file is an addition, not an update.
                watcher.addRequest(1, box.directory(box.root, 2));
                box.write('a.txt');
                box.fire('rename', 'a.txt');
                await box.expect(2, 'added a.txt');

                box.remove('a.txt');
                box.fire('rename', 'a.txt');
                await box.expect(2, 'added a.txt', 'deleted a.txt');
            } finally {
                watcher.dispose();
            }
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

        it('reports a child named like the watched directory', async () => {
            const sameName = path.basename(box.root);
            await box.watchingForReal(box.root, box.directory());

            box.mkdir(sameName);
            await box.expectAmong(1, `added ${sameName}`);

            box.remove(sameName);
            await box.expectAmong(1, `deleted ${sameName}`);
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
