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
import { isWindows } from '@theia/core';
import { FileUri } from '@theia/core/lib/node';
import { DidFilesChangedParams, FileChange, FileChangeType, FileSystemWatcherServiceClient } from '../../common/filesystem-watcher-protocol';
import { DirectoryIdentity, NodeDirectoryWatcher, NodeDirectoryWatcherTimings, NodeWatchRequest, WatchEventListener } from './node-directory-watcher';

const track = temp.track();

const TEST_TIMINGS: NodeDirectoryWatcherTimings = {
    changeDelay: 5,
    deleteDelay: 20,
    existencePollDelay: 20,
    deferredDisposalTimeout: 30
};

const NO_LOGGING = {
    verbose: false,
    info: () => { },
    error: () => { }
};

class TestClient implements FileSystemWatcherServiceClient {

    readonly events: DidFilesChangedParams[] = [];

    onDidFilesChanged(event: DidFilesChangedParams): void {
        this.events.push(event);
    }

    onError(): void { }

    changesOf(clientId: number): FileChange[] {
        return this.events.filter(event => event.clients?.includes(clientId)).flatMap(event => event.changes);
    }

    typesOf(clientId: number, uri: string): FileChangeType[] {
        return this.changesOf(clientId).filter(change => change.uri === uri).map(change => change.type);
    }

    async waitFor(predicate: () => boolean, description: string): Promise<void> {
        const deadline = Date.now() + 5000;
        while (!predicate()) {
            if (Date.now() > deadline) {
                throw new Error(`timed out waiting for ${description}, saw: ${JSON.stringify(this.events)}`);
            }
            await new Promise(resolve => setTimeout(resolve, 5));
        }
    }
}

/** Replaces the `fs.watch` handle so that platform behavior that cannot be reproduced on CI can be driven directly. */
class TestWatcher extends NodeDirectoryWatcher {

    readonly openedDirectories: string[] = [];
    existenceChecks = 0;
    /** Set to pretend the watched directory was replaced, which no test can force on a real file system. */
    fakeIdentity: DirectoryIdentity | undefined;
    /** Set to exercise the macOS and Windows file name handling on any host. */
    decomposes = false;
    caseSensitive = true;
    protected listener: WatchEventListener | undefined;
    protected fakeHandle: EventEmitter | undefined;

    protected override get decomposesFileNames(): boolean {
        return this.decomposes;
    }

    protected override get caseSensitiveFileNames(): boolean {
        return this.caseSensitive;
    }

    protected override async readIdentity(): Promise<DirectoryIdentity | undefined> {
        return this.fakeIdentity ?? super.readIdentity();
    }

    protected override exists(fsPath: string): Promise<boolean> {
        return super.exists(fsPath).then(result => {
            this.existenceChecks++;
            return result;
        });
    }

    protected override createWatchHandle(directory: string, listener: WatchEventListener): FSWatcher {
        this.openedDirectories.push(directory);
        this.listener = listener;
        const handle = new EventEmitter();
        this.fakeHandle = handle;
        return Object.assign(handle, { close: () => { } }) as unknown as FSWatcher;
    }

    fire(eventType: string, fileName: string | null): void {
        assert.ok(this.listener, 'watcher is not started');
        this.listener(eventType, fileName);
    }

    fail(error: Error): void {
        this.fakeHandle?.emit('error', error);
    }

    get watchedPath(): string {
        return this.watchedDirectory;
    }

    get pendingDeleteCount(): number {
        return this.pendingDeletes.size;
    }
}

function directoryRequest(clientId: number, requestPath: string, ignored: string[] = []): NodeWatchRequest {
    return { clientId, path: requestPath, ignored: ignored.map(pattern => new Minimatch(pattern, { dot: true })) };
}

function fileRequest(clientId: number, filePath: string, ignored: string[] = []): NodeWatchRequest {
    return { ...directoryRequest(clientId, filePath, ignored), fileName: path.basename(filePath) };
}

describe('node-directory-watcher', function (): void {

    this.timeout(20000);

    let root: string;
    let client: TestClient;
    const watchers: NodeDirectoryWatcher[] = [];

    beforeEach(() => {
        root = fs.realpathSync(temp.mkdirSync('node-directory-watcher'));
        client = new TestClient();
    });

    afterEach(() => {
        watchers.splice(0).forEach(watcher => watcher.dispose());
        track.cleanupSync();
    });

    function createWatcher(target: string): TestWatcher {
        const watcher = new TestWatcher(target, NO_LOGGING, client, TEST_TIMINGS);
        watchers.push(watcher);
        return watcher;
    }

    async function started(target: string, ...requests: NodeWatchRequest[]): Promise<TestWatcher> {
        const watcher = createWatcher(target);
        requests.forEach((request, index) => watcher.addRequest(index, request));
        await watcher.whenStarted;
        return watcher;
    }

    function uriOf(...segments: string[]): string {
        return FileUri.create(path.resolve(root, ...segments)).toString();
    }

    describe('change classification', () => {

        it('reports a new direct child as added and a known one as updated', async () => {
            const watcher = await started(root, directoryRequest(1, root));

            fs.writeFileSync(path.resolve(root, 'a.txt'), 'a');
            watcher.fire('rename', 'a.txt');
            await client.waitFor(() => client.typesOf(1, uriOf('a.txt')).length > 0, 'the added file');
            assert.deepStrictEqual(client.typesOf(1, uriOf('a.txt')), [FileChangeType.ADDED]);

            client.events.length = 0;
            watcher.fire('rename', 'a.txt');
            await client.waitFor(() => client.typesOf(1, uriOf('a.txt')).length > 0, 'the updated file');
            assert.deepStrictEqual(client.typesOf(1, uriOf('a.txt')), [FileChangeType.UPDATED]);
        });

        it('reports a change event as updated', async () => {
            fs.writeFileSync(path.resolve(root, 'a.txt'), 'a');
            const watcher = await started(root, directoryRequest(1, root));

            watcher.fire('change', 'a.txt');
            await client.waitFor(() => client.typesOf(1, uriOf('a.txt')).length > 0, 'the updated file');
            assert.deepStrictEqual(client.typesOf(1, uriOf('a.txt')), [FileChangeType.UPDATED]);
        });

        it('confirms a deletion only after the grace period', async () => {
            fs.writeFileSync(path.resolve(root, 'a.txt'), 'a');
            const watcher = await started(root, directoryRequest(1, root));

            fs.removeSync(path.resolve(root, 'a.txt'));
            watcher.fire('rename', 'a.txt');
            assert.strictEqual(client.changesOf(1).length, 0, 'nothing is reported before the grace period');

            await client.waitFor(() => client.typesOf(1, uriOf('a.txt')).length > 0, 'the deleted file');
            assert.deepStrictEqual(client.typesOf(1, uriOf('a.txt')), [FileChangeType.DELETED]);
        });

        it('reports an atomic save as an update rather than a deletion', async () => {
            const file = path.resolve(root, 'a.txt');
            fs.writeFileSync(file, 'a');
            const watcher = await started(root, directoryRequest(1, root));

            fs.removeSync(file);
            watcher.fire('rename', 'a.txt');
            fs.writeFileSync(file, 'b');

            await client.waitFor(() => client.typesOf(1, uriOf('a.txt')).length > 0, 'the updated file');
            assert.deepStrictEqual(client.typesOf(1, uriOf('a.txt')), [FileChangeType.UPDATED]);
        });

        it('reports a file that appears and vanishes within the grace period as added and deleted', async () => {
            const watcher = await started(root, directoryRequest(1, root));

            watcher.fire('rename', 'ghost.txt');
            await client.waitFor(() => client.typesOf(1, uriOf('ghost.txt')).length > 1, 'both changes');
            assert.deepStrictEqual(client.typesOf(1, uriOf('ghost.txt')), [FileChangeType.ADDED, FileChangeType.DELETED]);
        });

        it('rescans the directory when the platform reports a change without a file name', async () => {
            fs.writeFileSync(path.resolve(root, 'gone.txt'), 'a');
            const watcher = await started(root, directoryRequest(1, root));

            fs.writeFileSync(path.resolve(root, 'new.txt'), 'a');
            fs.removeSync(path.resolve(root, 'gone.txt'));
            // eslint-disable-next-line no-null/no-null
            watcher.fire('change', null);

            await client.waitFor(() => client.changesOf(1).length > 1, 'the rescanned changes');
            assert.deepStrictEqual(client.typesOf(1, uriOf('new.txt')), [FileChangeType.ADDED]);
            assert.deepStrictEqual(client.typesOf(1, uriOf('gone.txt')), [FileChangeType.DELETED]);
        });

        it('settles a pending deletion that a rescan already resolved', async () => {
            fs.writeFileSync(path.resolve(root, 'a.txt'), 'a');
            const watcher = await started(root, directoryRequest(1, root));

            fs.removeSync(path.resolve(root, 'a.txt'));
            watcher.fire('rename', 'a.txt');
            // eslint-disable-next-line no-null/no-null
            watcher.fire('change', null);

            await client.waitFor(() => client.typesOf(1, uriOf('a.txt')).length > 0, 'the deleted file');
            await new Promise(resolve => setTimeout(resolve, TEST_TIMINGS.deleteDelay * 3));
            assert.deepStrictEqual(client.typesOf(1, uriOf('a.txt')), [FileChangeType.DELETED], 'the deletion must be reported once');
        });

        it('matches a decomposed file name against the composed path a request asked for', async () => {
            const composed = 'café.txt'.normalize('NFC');
            const watcher = await started(root, fileRequest(1, path.resolve(root, composed)));
            watcher.decomposes = true;

            fs.writeFileSync(path.resolve(root, composed), 'a');
            watcher.fire('rename', 'café.txt');

            await client.waitFor(() => client.changesOf(1).length > 0, 'the watched file');
            assert.deepStrictEqual(client.changesOf(1).map(change => change.uri), [uriOf(composed)]);
        });

        it('matches a file name irrespective of case where the platform does', async () => {
            const watcher = await started(root, fileRequest(1, path.resolve(root, 'Wanted.txt')));
            watcher.caseSensitive = false;

            fs.writeFileSync(path.resolve(root, 'wanted.txt'), 'a');
            watcher.fire('rename', 'wanted.txt');

            await client.waitFor(() => client.changesOf(1).length > 0, 'the watched file');
            assert.deepStrictEqual(client.changesOf(1).map(change => change.uri), [uriOf('Wanted.txt')]);
        });

        it('ignores an event that names a path outside the watched directory level', async () => {
            const watcher = await started(root, directoryRequest(1, root));

            fs.mkdirSync(path.resolve(root, 'nested'));
            fs.writeFileSync(path.resolve(root, 'nested', 'a.txt'), 'a');
            fs.writeFileSync(path.resolve(root, 'sentinel.txt'), 'a');
            watcher.fire('rename', path.join('nested', 'a.txt'));
            watcher.fire('rename', 'sentinel.txt');
            await client.waitFor(() => client.changesOf(1).length > 0, 'the sentinel');
            assert.deepStrictEqual(client.changesOf(1).map(change => change.uri), [uriOf('sentinel.txt')]);
        });
    });

    describe('request routing', () => {

        it('reports only its own file to a file request', async () => {
            const watcher = await started(root, fileRequest(1, path.resolve(root, 'wanted.txt')));

            fs.writeFileSync(path.resolve(root, 'other.txt'), 'a');
            fs.writeFileSync(path.resolve(root, 'wanted.txt'), 'a');
            watcher.fire('rename', 'other.txt');
            watcher.fire('rename', 'wanted.txt');

            await client.waitFor(() => client.changesOf(1).length > 0, 'the watched file');
            assert.deepStrictEqual(client.changesOf(1).map(change => change.uri), [uriOf('wanted.txt')]);
        });

        it('applies the excludes of each request separately', async () => {
            const watcher = await started(root,
                directoryRequest(1, root, ['**/node_modules']),
                directoryRequest(2, root));

            fs.mkdirSync(path.resolve(root, 'node_modules'));
            watcher.fire('rename', 'node_modules');

            await client.waitFor(() => client.changesOf(2).length > 0, 'the unfiltered request');
            assert.strictEqual(client.changesOf(1).length, 0, 'the excluded request must see nothing');
            assert.deepStrictEqual(client.changesOf(2).map(change => change.uri), [uriOf('node_modules')]);
        });

        it('notifies a client holding overlapping requests once', async () => {
            const file = path.resolve(root, 'a.txt');
            fs.writeFileSync(file, 'a');
            const watcher = await started(root, directoryRequest(1, root), fileRequest(1, file), directoryRequest(2, root));

            watcher.fire('change', 'a.txt');
            await client.waitFor(() => client.changesOf(2).length > 0, 'the second client');

            assert.deepStrictEqual(client.changesOf(1), [{ uri: uriOf('a.txt'), type: FileChangeType.UPDATED }], 'one change for the overlapping client');
            assert.deepStrictEqual(client.changesOf(2), [{ uri: uriOf('a.txt'), type: FileChangeType.UPDATED }]);
        });

        it('reports changes under the path each request asked for', async () => {
            const link = path.resolve(root, 'link');
            const real = path.resolve(root, 'real');
            fs.mkdirSync(real);
            fs.symlinkSync(real, link, isWindows ? 'junction' : 'dir');
            const watcher = await started(real, directoryRequest(1, real), directoryRequest(2, link));

            fs.writeFileSync(path.resolve(real, 'a.txt'), 'a');
            watcher.fire('rename', 'a.txt');

            await client.waitFor(() => client.changesOf(2).length > 0, 'the symlinked request');
            assert.deepStrictEqual(client.changesOf(1).map(change => change.uri), [uriOf('real', 'a.txt')]);
            assert.deepStrictEqual(client.changesOf(2).map(change => change.uri), [uriOf('link', 'a.txt')]);
        });
    });

    describe('watched directory lifecycle', () => {

        it('watches the parent directory of a file target', async () => {
            const file = path.resolve(root, 'a.txt');
            fs.writeFileSync(file, 'a');
            const watcher = await started(file, fileRequest(1, file));

            assert.strictEqual(watcher.watchedPath, root);
            assert.deepStrictEqual(watcher.openedDirectories, [root]);
        });

        it('starts once a target that does not exist yet appears, and reports it', async () => {
            const target = path.resolve(root, 'later');
            const watcher = createWatcher(target);
            watcher.addRequest(0, directoryRequest(1, target));

            await client.waitFor(() => watcher.existenceChecks > 0, 'the watcher to observe the missing target');
            fs.mkdirSync(target);
            await watcher.whenStarted;

            await client.waitFor(() => client.changesOf(1).length > 0, 'the appeared target');
            assert.deepStrictEqual(client.typesOf(1, FileUri.create(target).toString()), [FileChangeType.ADDED]);
            assert.strictEqual(watcher.watchedPath, target);
        });

        it('treats a target that turns out to be a file as a file request', async () => {
            const target = path.resolve(root, 'later.txt');
            const watcher = createWatcher(target);
            watcher.addRequest(0, directoryRequest(1, target));

            await client.waitFor(() => watcher.existenceChecks > 0, 'the watcher to observe the missing target');
            fs.writeFileSync(target, 'a');
            await watcher.whenStarted;

            assert.strictEqual(watcher.watchedPath, root);
            client.events.length = 0;
            fs.writeFileSync(path.resolve(root, 'other.txt'), 'a');
            watcher.fire('rename', 'other.txt');
            watcher.fire('change', 'later.txt');
            await client.waitFor(() => client.changesOf(1).length > 0, 'the watched file');
            assert.deepStrictEqual(client.changesOf(1).map(change => change.uri), [FileUri.create(target).toString()]);
        });

        it('reports the deletion of the watched directory and recovers when it comes back', async () => {
            const target = path.resolve(root, 'workspace');
            fs.mkdirSync(target);
            fs.writeFileSync(path.resolve(target, 'before.txt'), 'a');
            const watcher = await started(target, directoryRequest(1, target));
            const targetUri = FileUri.create(target).toString();

            fs.removeSync(target);
            watcher.fire('rename', 'workspace');
            await client.waitFor(() => client.typesOf(1, targetUri).includes(FileChangeType.DELETED), 'the deleted directory');

            fs.mkdirSync(target);
            fs.writeFileSync(path.resolve(target, 'after.txt'), 'a');
            await client.waitFor(() => client.typesOf(1, targetUri).includes(FileChangeType.ADDED), 'the restored directory');
            await client.waitFor(() => client.changesOf(1).some(change => change.uri === FileUri.create(path.resolve(target, 'after.txt')).toString()),
                'the changes made while the directory was gone');

            assert.strictEqual(watcher.openedDirectories.length, 2, 'a new handle must be opened for the new directory');
        });

        it('recovers when the watched directory is replaced rather than removed', async () => {
            const target = path.resolve(root, 'workspace');
            fs.mkdirSync(target);
            const watcher = await started(target, directoryRequest(1, target));

            fs.removeSync(target);
            fs.mkdirSync(target);
            watcher.fire('rename', 'workspace');

            await client.waitFor(() => client.typesOf(1, FileUri.create(target).toString()).includes(FileChangeType.DELETED), 'the replaced directory');
            await client.waitFor(() => watcher.openedDirectories.length === 2, 'the new handle');
        });

        it('recovers from a handle error without reporting a change', async () => {
            const watcher = await started(root, directoryRequest(1, root));

            watcher.fail(new Error('EPERM'));
            await client.waitFor(() => watcher.openedDirectories.length === 2, 'the new handle');

            assert.deepStrictEqual(client.changesOf(1), [], 'a handle that fails while the directory is untouched changes nothing');
        });

        it('reports a directory that was replaced while its inode number was reused', async () => {
            const watcher = await started(root, directoryRequest(1, root));
            const rootUri = FileUri.create(root).toString();

            watcher.fakeIdentity = { dev: 1, ino: 2, birthtimeMs: 3 };
            watcher.fire('rename', 'a.txt');

            await client.waitFor(() => client.typesOf(1, rootUri).includes(FileChangeType.DELETED), 'the replaced directory');
            await client.waitFor(() => client.typesOf(1, rootUri).includes(FileChangeType.ADDED), 'the restored directory');
            assert.strictEqual(watcher.openedDirectories.length, 2);
        });
    });

    describe('disposal', () => {

        it('disposes once the last request is released', async () => {
            const watcher = await started(root, directoryRequest(1, root), directoryRequest(2, root));

            watcher.removeRequest(0);
            await new Promise(resolve => setTimeout(resolve, TEST_TIMINGS.deferredDisposalTimeout * 2));
            assert.strictEqual(watcher.isDisposed, false, 'a watcher with requests left must stay alive');

            watcher.removeRequest(1);
            await watcher.whenDisposed;
            assert.strictEqual(watcher.isDisposed, true);
        });

        it('revives when a request arrives before the deferred disposal', async () => {
            const watcher = await started(root, directoryRequest(1, root));

            watcher.removeRequest(0);
            watcher.addRequest(1, directoryRequest(2, root));
            await new Promise(resolve => setTimeout(resolve, TEST_TIMINGS.deferredDisposalTimeout * 2));

            assert.strictEqual(watcher.isDisposed, false);
        });

        it('emits nothing and leaves no pending deletion behind when disposed mid-flight', async () => {
            fs.writeFileSync(path.resolve(root, 'a.txt'), 'a');
            const watcher = await started(root, directoryRequest(1, root));

            fs.removeSync(path.resolve(root, 'a.txt'));
            watcher.fire('rename', 'a.txt');
            await client.waitFor(() => watcher.pendingDeleteCount > 0, 'the pending deletion');
            watcher.dispose();

            await new Promise(resolve => setTimeout(resolve, TEST_TIMINGS.deleteDelay * 3));
            assert.strictEqual(watcher.pendingDeleteCount, 0);
            assert.strictEqual(client.changesOf(1).length, 0);
        });
    });

    describe('with a real fs.watch handle', () => {

        async function realWatcher(target: string, ...requests: NodeWatchRequest[]): Promise<NodeDirectoryWatcher> {
            const watcher = new NodeDirectoryWatcher(target, NO_LOGGING, client, TEST_TIMINGS);
            requests.forEach((request, index) => watcher.addRequest(index, request));
            watchers.push(watcher);
            await watcher.whenStarted;
            return watcher;
        }

        it('reports direct children and nothing below them', async () => {
            const nested = path.resolve(root, 'nested');
            fs.mkdirSync(nested);
            await realWatcher(root, directoryRequest(1, root));

            fs.writeFileSync(path.resolve(nested, 'deep.txt'), 'a');
            fs.writeFileSync(path.resolve(root, 'direct.txt'), 'a');

            await client.waitFor(() => client.typesOf(1, uriOf('direct.txt')).includes(FileChangeType.ADDED), 'the direct child');
            assert.deepStrictEqual(client.typesOf(1, uriOf('nested', 'deep.txt')), [], 'a nested change must not be reported');
        });

        it('reports an update and a deletion of a direct child', async () => {
            const file = path.resolve(root, 'a.txt');
            fs.writeFileSync(file, 'a');
            await realWatcher(root, directoryRequest(1, root));

            fs.writeFileSync(file, 'b');
            await client.waitFor(() => client.typesOf(1, uriOf('a.txt')).includes(FileChangeType.UPDATED), 'the update');

            fs.removeSync(file);
            await client.waitFor(() => client.typesOf(1, uriOf('a.txt')).includes(FileChangeType.DELETED), 'the deletion');
        });

        it('reports a single file through its parent directory', async () => {
            const file = path.resolve(root, 'a.txt');
            fs.writeFileSync(file, 'a');
            await realWatcher(file, fileRequest(1, file));

            fs.writeFileSync(path.resolve(root, 'other.txt'), 'a');
            fs.writeFileSync(file, 'b');

            await client.waitFor(() => client.typesOf(1, uriOf('a.txt')).length > 0, 'the watched file');
            assert.deepStrictEqual(client.typesOf(1, uriOf('other.txt')), [], 'a sibling must not be reported');
        });
    });
});
