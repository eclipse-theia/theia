/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import * as temp from 'temp';
import * as chai from 'chai';
import * as fs from 'fs-extra';
import * as assert from 'assert';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node';
import { NsfwFileSystemWatcherServer } from './nsfw-filesystem-watcher';
import { DidFilesChangedParams } from '../../common/filesystem-watcher-protocol';
// tslint:disable:no-unused-expression

const expect = chai.expect;
const track = temp.track();

describe('nsfw-filesystem-watcher', function () {

    let root: URI;
    let watcherServer: NsfwFileSystemWatcherServer;
    let watcherId: number;

    this.timeout(10000);

    beforeEach(async () => {
        root = FileUri.create(fs.realpathSync(temp.mkdirSync('node-fs-root')));
        watcherServer = createNsfwFileSystemWatcherServer();
        watcherId = await watcherServer.watchFileChanges(root.toString());
        await sleep(2000);
    });

    afterEach(async () => {
        track.cleanupSync();
        watcherServer.dispose();
    });

    it('Should receive file changes events from in the workspace by default.', async function () {
        if (process.platform === 'win32') {
            this.skip();
            return;
        }
        const actualUris = new Set<string>();

        const watcherClient = {
            onDidFilesChanged(event: DidFilesChangedParams) {
                event.changes.forEach(c => actualUris.add(c.uri.toString()));
            }
        };
        watcherServer.setClient(watcherClient);

        const expectedUris = [
            root.resolve('foo').toString(),
            root.withPath(root.path.join('foo', 'bar')).toString(),
            root.withPath(root.path.join('foo', 'bar', 'baz.txt')).toString()
        ];

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo'))).isDirectory()).to.be.true;
        await sleep(2000);

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo').resolve('bar')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo').resolve('bar'))).isDirectory()).to.be.true;
        await sleep(2000);

        fs.writeFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'baz');
        expect(fs.readFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'utf8')).to.be.equal('baz');
        await sleep(2000);

        assert.deepEqual(expectedUris, [...actualUris]);
    });

    it('Should not receive file changes events from in the workspace by default if unwatched', async function () {
        if (process.platform === 'win32') {
            this.skip();
            return;
        }
        const actualUris = new Set<string>();

        const watcherClient = {
            onDidFilesChanged(event: DidFilesChangedParams) {
                event.changes.forEach(c => actualUris.add(c.uri.toString()));
            }
        };
        watcherServer.setClient(watcherClient);

        /* Unwatch root */
        watcherServer.unwatchFileChanges(watcherId);

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo'))).isDirectory()).to.be.true;
        await sleep(2000);

        fs.mkdirSync(FileUri.fsPath(root.resolve('foo').resolve('bar')));
        expect(fs.statSync(FileUri.fsPath(root.resolve('foo').resolve('bar'))).isDirectory()).to.be.true;
        await sleep(2000);

        fs.writeFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'baz');
        expect(fs.readFileSync(FileUri.fsPath(root.resolve('foo').resolve('bar').resolve('baz.txt')), 'utf8')).to.be.equal('baz');
        await sleep(2000);

        assert.deepEqual(0, actualUris.size);
    });

    function createNsfwFileSystemWatcherServer() {
        return new NsfwFileSystemWatcherServer({
            verbose: true
        });
    }

    function sleep(time: number) {
        return new Promise(resolve => setTimeout(resolve, time));
    }

});

// tslint:disable-next-line:no-any
process.on('unhandledRejection', (reason: any) => {
    console.error('Unhandled promise rejection: ' + reason);
});
