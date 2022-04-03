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
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as temp from 'temp';
import * as chai from 'chai';
import * as cp from 'child_process';
import * as fs from '@theia/core/shared/fs-extra';
import * as assert from 'assert';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node';
import { NsfwFileSystemWatcherServer } from './nsfw-filesystem-watcher-server';
import { wait } from '@theia/core';

/* eslint-disable no-unused-expressions */

const expect = chai.expect;
const track = temp.track();

describe('nsfw-filesystem-watcher', function (): void {

    let root: URI;
    let watcherServer: NsfwFileSystemWatcherServer;
    let watcherId: number;

    this.timeout(10000);

    beforeEach(async () => {
        let tempPath = temp.mkdirSync('node-fs-root');
        // Sometimes tempPath will use some Windows 8.3 short name in its path. This is a problem
        // since NSFW always returns paths with long names. We need to convert here.
        // See: https://stackoverflow.com/a/34473971/7983255
        if (process.platform === 'win32') {
            tempPath = cp.execSync(`powershell "(Get-Item -LiteralPath '${tempPath}').FullName"`, {
                encoding: 'utf8',
            }).trim();
        }
        root = FileUri.create(fs.realpathSync(tempPath));
        watcherServer = createNsfwFileSystemWatcherServer();
        watcherId = await watcherServer.watchFileChanges(root.toString());
        await wait(2000);
    });

    afterEach(async () => {
        track.cleanupSync();
    });

    it('Should receive file changes events from in the workspace by default.', async function (): Promise<void> {
        const actualUris = new Set<string>();

        watcherServer.onDidFilesChanged(event => {
            event.changes.forEach(c => actualUris.add(c.uri.toString()));
        });

        const expectedUris = [
            root.resolve('foo').toString(),
            root.withPath(root.path.join('foo', 'bar')).toString(),
            root.withPath(root.path.join('foo', 'bar', 'baz.txt')).toString()
        ];

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo'))).isDirectory()).to.be.true;
        await wait(2000);

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo').resolve('bar')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo').resolve('bar'))).isDirectory()).to.be.true;
        await wait(2000);

        fs.writeFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'baz');
        expect(fs.readFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'utf8')).to.be.equal('baz');
        await wait(2000);

        assert.deepStrictEqual([...actualUris], expectedUris);
    });

    it('Should not receive file changes events from in the workspace by default if unwatched', async function (): Promise<void> {
        const actualUris = new Set<string>();

        watcherServer.onDidFilesChanged(event => {
            event.changes.forEach(c => actualUris.add(c.uri.toString()));
        });

        /* Unwatch root */
        watcherServer.unwatchFileChanges(watcherId);

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo'))).isDirectory()).to.be.true;
        await wait(2000);

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo').resolve('bar')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo').resolve('bar'))).isDirectory()).to.be.true;
        await wait(2000);

        fs.writeFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'baz');
        expect(fs.readFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'utf8')).to.be.equal('baz');
        await wait(2000);

        assert.deepStrictEqual(actualUris.size, 0);
    });

    function createNsfwFileSystemWatcherServer(): NsfwFileSystemWatcherServer {
        return new NsfwFileSystemWatcherServer({
            verbose: true
        });
    }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
process.on('unhandledRejection', (reason: any) => {
    console.error('Unhandled promise rejection: ' + reason);
});
