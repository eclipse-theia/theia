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
import { ParcelFileSystemWatcherService } from './parcel-filesystem-service';
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

        const watcherClient = {
            onDidFilesChanged(event: DidFilesChangedParams): void {
                event.changes.forEach(c => actualUris.add(c.uri.toString()));
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
        await sleep(200);

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo').resolve('bar')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo').resolve('bar'))).isDirectory()).to.be.true;
        await sleep(200);

        fs.writeFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'baz');
        expect(fs.readFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'utf8')).to.be.equal('baz');
        await sleep(200);

        assert.deepStrictEqual([...actualUris], expectedUris);
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

    it('Renaming should emit a DELETED and ADDED event', async function (): Promise<void> {
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

});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on('unhandledRejection', (reason: any) => {
    console.error('Unhandled promise rejection: ' + reason);
});
