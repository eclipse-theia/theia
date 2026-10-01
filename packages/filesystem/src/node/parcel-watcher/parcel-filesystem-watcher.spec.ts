// *****************************************************************************
// Copyright (C) 2018 Ericsson and others.
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

import * as temp from 'temp';
import * as chai from 'chai';
import * as cp from 'child_process';
import * as fs from '@theia/core/shared/fs-extra';
import * as assert from 'assert';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node';
import { ParcelFileSystemWatcherService, ParcelWatcher } from './parcel-filesystem-service';
import { DidFilesChangedParams, FileChange, FileChangeType } from '../../common/filesystem-watcher-protocol';

const expect = chai.expect;
const track = temp.track();

describe('parcel-filesystem-watcher', function (): void {

    let root: URI;
    let watcherService: ParcelFileSystemWatcherService;
    let watcherId: number;

    this.timeout(100000);

    beforeEach(async () => {
        let tempPath = temp.mkdirSync('node-fs-root');
        // Sometimes tempPath will use some Windows 8.3 short name in its path. This is a problem
        // since parcel always returns paths with long names. We need to convert here.
        // See: https://stackoverflow.com/a/34473971/7983255
        if (process.platform === 'win32') {
            tempPath = cp.execSync(`powershell "(Get-Item -LiteralPath '${tempPath}').FullName"`, {
                encoding: 'utf8',
            }).trim();
        }
        root = FileUri.create(fs.realpathSync(tempPath));
        watcherService = createParcelFileSystemWatcherService();
        watcherId = await watcherService.watchFileChanges(0, root.toString());
        await sleep(200);
    });

    afterEach(async () => {
        track.cleanupSync();
        watcherService.dispose();
    });

    it('Should receive file changes events from in the workspace by default.', async function (): Promise<void> {
        const actualUris = new Set<string>();
        const changeListeners: Array<() => void> = [];

        const watcherClient = {
            onDidFilesChanged(event: DidFilesChangedParams): void {
                event.changes.forEach(c => actualUris.add(c.uri.toString()));
                changeListeners.forEach(l => l());
            },
            onError(): void {
            }
        };
        watcherService.setClient(watcherClient);

        const expectedUris = [
            root.resolve('foo').toString(),
            root.withPath(root.path.join('foo', 'bar')).toString(),
            root.withPath(root.path.join('foo', 'bar', 'baz.txt')).toString()
        ];

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo'))).isDirectory()).to.be.true;
        await waitForChange(actualUris, changeListeners, expectedUris[0]);

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo').resolve('bar')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo').resolve('bar'))).isDirectory()).to.be.true;
        await waitForChange(actualUris, changeListeners, expectedUris[1]);

        fs.writeFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'baz');
        expect(fs.readFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'utf8')).to.be.equal('baz');
        await waitForChange(actualUris, changeListeners, expectedUris[2]);

        // Each expected URI already arrived above, so what is left is that nothing else did. macOS may also
        // report the root, since creating a child modifies it.
        const unexpectedUris = [...actualUris].filter(uri => !expectedUris.includes(uri) && uri !== root.toString());
        assert.deepStrictEqual(unexpectedUris, []);
    });

    it('Should start watching nonexistent files and nested paths without waiting for them to appear.', async function (): Promise<void> {
        const actualUris = new Set<string>();
        const actualTypes = new Map<string, Set<FileChangeType>>();
        const changeListeners: Array<() => void> = [];
        const watcherClient = {
            onDidFilesChanged(event: DidFilesChangedParams): void {
                event.changes.forEach(change => {
                    const uri = change.uri.toString();
                    actualUris.add(uri);
                    let types = actualTypes.get(uri);
                    if (!types) {
                        actualTypes.set(uri, types = new Set());
                    }
                    types.add(change.type);
                });
                changeListeners.forEach(listener => listener());
            },
            onError(): void {
            }
        };
        const watcherOptions = { ignored: [], ignorePatterns: [] };
        const serverOptions = {
            verbose: false,
            info: () => undefined,
            error: () => undefined,
            parcelOptions: {},
        };
        const missingFile = root.resolve('missing.txt');
        const missingDirectory = root.resolve('missing-directory');
        const nestedDirectory = missingDirectory.resolve('nested');
        const nestedFile = nestedDirectory.resolve('settings.json');
        const watchers = [
            new ParcelWatcher(0, FileUri.fsPath(missingFile), watcherOptions, serverOptions, watcherClient, 0),
            new ParcelWatcher(0, FileUri.fsPath(nestedFile), watcherOptions, serverOptions, watcherClient, 0),
        ];
        let startupTimer: NodeJS.Timeout | undefined;

        try {
            const started = await Promise.race([
                Promise.all(watchers.map(watcher => watcher.whenStarted)),
                new Promise<never>((_, reject) => {
                    startupTimer = setTimeout(() => reject(new Error('Watchers did not start before their targets existed.')), 3000);
                }),
            ]);
            expect(started).to.deep.equal([true, true]);

            fs.writeFileSync(FileUri.fsPath(missingFile), 'missing');
            await waitForChange(actualUris, changeListeners, missingFile.toString());

            fs.mkdirSync(FileUri.fsPath(missingDirectory));
            await waitForChange(actualUris, changeListeners, missingDirectory.toString());
            fs.mkdirSync(FileUri.fsPath(nestedDirectory));
            await waitForChange(actualUris, changeListeners, nestedDirectory.toString());
            fs.writeFileSync(FileUri.fsPath(nestedFile), 'settings');
            await waitForChange(actualUris, changeListeners, nestedFile.toString());

            expect(actualTypes.get(missingFile.toString())?.has(FileChangeType.ADDED)).to.be.true;
            expect(actualTypes.get(nestedFile.toString())?.has(FileChangeType.ADDED)).to.be.true;
        } finally {
            if (startupTimer) {
                clearTimeout(startupTimer);
            }
            watchers.forEach(watcher => watcher.removeRef(0));
            await Promise.all(watchers.map(watcher => watcher.whenDisposed));
        }
    });

    it('Should not receive file changes events from in the workspace by default if unwatched', async function (): Promise<void> {
        const actualUris = new Set<string>();

        const watcherClient = {
            onDidFilesChanged(event: DidFilesChangedParams): void {
                event.changes.forEach(c => actualUris.add(c.uri.toString()));
            },
            onError(): void {
            }
        };
        watcherService.setClient(watcherClient);

        /* Unwatch root */
        await watcherService.unwatchFileChanges(watcherId);

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo'))).isDirectory()).to.be.true;
        await sleep(200);

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo').resolve('bar')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo').resolve('bar'))).isDirectory()).to.be.true;
        await sleep(200);

        fs.writeFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'baz');
        expect(fs.readFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'utf8')).to.be.equal('baz');
        await sleep(200);

        assert.deepStrictEqual(actualUris.size, 0);
    });

    // Skip on Mac: this test fails in Mac CI due to case-insensitive filesystem behavior
    it.skip('Renaming should emit a DELETED and ADDED event', async function (): Promise<void> {
        const file_txt = root.resolve('file.txt');
        const FILE_txt = root.resolve('FILE.txt');
        const changes: FileChange[] = [];
        watcherService.setClient({
            onDidFilesChanged: event => event.changes.forEach(change => changes.push(change)),
            onError: console.error
        });
        await fs.promises.writeFile(
            FileUri.fsPath(file_txt),
            'random content\n'
        );
        await sleep(200);
        await fs.promises.rename(
            FileUri.fsPath(file_txt),
            FileUri.fsPath(FILE_txt)
        );
        await sleep(200);
        // The order of DELETED and ADDED is not deterministic
        try {
            expect(changes).deep.eq([
                // initial file creation change event:
                { type: FileChangeType.ADDED, uri: file_txt.toString() },
                // rename change events:
                { type: FileChangeType.DELETED, uri: file_txt.toString() },
                { type: FileChangeType.ADDED, uri: FILE_txt.toString() },
            ]);
        } catch {
            expect(changes).deep.eq([
                // initial file creation change event:
                { type: FileChangeType.ADDED, uri: file_txt.toString() },
                // rename change events:
                { type: FileChangeType.ADDED, uri: FILE_txt.toString() },
                { type: FileChangeType.DELETED, uri: file_txt.toString() },
            ]);
        }
    });

    function createParcelFileSystemWatcherService(): ParcelFileSystemWatcherService {
        return new ParcelFileSystemWatcherService({
            verbose: true
        });
    }

    function sleep(time: number): Promise<unknown> {
        return new Promise(resolve => setTimeout(resolve, time));
    }

    /**
     * Wait for a specific URI to appear in the change set, driven by watcher events.
     * Resolves immediately if the URI is already present.
     */
    function waitForChange(
        receivedUris: Set<string>,
        listeners: Array<() => void>,
        expectedUri: string,
        timeoutMs = 10000
    ): Promise<void> {
        if (receivedUris.has(expectedUri)) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
                const idx = listeners.indexOf(check);
                if (idx >= 0) {
                    listeners.splice(idx, 1);
                }
                reject(new Error(`Timed out after ${timeoutMs}ms waiting for change event: ${expectedUri}`));
            }, timeoutMs);
            function check(): void {
                if (receivedUris.has(expectedUri)) {
                    clearTimeout(timer);
                    const idx = listeners.indexOf(check);
                    if (idx >= 0) {
                        listeners.splice(idx, 1);
                    }
                    resolve();
                }
            }
            listeners.push(check);
        });
    }

});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on('unhandledRejection', (reason: any) => {
    console.error('Unhandled promise rejection: ' + reason);
});
