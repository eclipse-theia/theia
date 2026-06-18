// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import * as chai from 'chai';
import * as sinon from 'sinon';
import * as temp from 'temp';
import * as fs from '@theia/core/shared/fs-extra';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node';
import { ParcelFileSystemWatcherService } from './parcel-filesystem-service';

// We require the *same* module object that the production code imports from, so that
// stubbing its `subscribe` export is observed by `ParcelWatcher`. The `@theia/core/shared`
// shim simply re-exports `require('@parcel/watcher')`, so this is the identical reference.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const parcel = require('@theia/core/shared/@parcel/watcher');

const expect = chai.expect;
const track = temp.track();

/**
 * Covers the inotify-tree-race fix in `ParcelWatcher.start()`:
 *
 * parcel-watcher walks the directory tree and only then calls `inotify_add_watch`
 * on each subdirectory. If a subdirectory disappears between the walk and the add
 * (common when watching dirs that contain rotated logs/temp folders), the syscall
 * returns ENOENT and parcel-watcher fails the *entire* subscribe. The fix retries
 * `createWatcher` a few times, but only when (a) the underlying error indicates a
 * missing path and (b) the watched root itself still exists.
 */
describe('parcel-filesystem-watcher transient ENOENT handling', function (): void {

    this.timeout(20000);

    let root: URI;
    let service: ParcelFileSystemWatcherService;
    let subscribeStub: sinon.SinonStub | undefined;
    let consoleErrorStub: sinon.SinonStub;
    let onError: sinon.SinonStub;

    beforeEach(() => {
        const tempPath = temp.mkdirSync('parcel-enoent-root');
        root = FileUri.create(fs.realpathSync(tempPath));
        // start() now logs the underlying error to stderr on failure; silence it
        // so the test output stays readable.
        consoleErrorStub = sinon.stub(console, 'error');
        service = new ParcelFileSystemWatcherService({ verbose: false });
        onError = sinon.stub();
        service.setClient({
            onDidFilesChanged: () => undefined,
            onError,
        });
    });

    afterEach(() => {
        subscribeStub?.restore();
        consoleErrorStub.restore();
        track.cleanupSync();
    });

    it('retries when subscribe throws a transient ENOENT and the watched root still exists', async () => {
        let attempts = 0;
        subscribeStub = sinon.stub(parcel, 'subscribe').callsFake(async () => {
            attempts++;
            if (attempts < 3) {
                throw new Error('No such file or directory at /tmp/rotated-log');
            }
            return { unsubscribe: async () => undefined };
        });

        await service.watchFileChanges(0, root.toString());
        // Backoff schedule for two retries: 100 + 200 = 300ms. Leave generous margin.
        await new Promise(resolve => setTimeout(resolve, 800));

        expect(attempts, 'subscribe should have been retried until it succeeded').to.equal(3);
        expect(onError.called, 'no error should surface to the client once the retry recovered').to.equal(false);
    });

    it('does not retry on non-ENOENT errors and surfaces the failure immediately', async () => {
        subscribeStub = sinon.stub(parcel, 'subscribe').callsFake(async () => {
            throw new Error('EACCES: permission denied');
        });

        await service.watchFileChanges(0, root.toString());
        await new Promise(resolve => setTimeout(resolve, 200));

        expect(subscribeStub.callCount, 'non-transient errors must not trigger any retry').to.equal(1);
        expect(onError.called, 'error must be reported to the client').to.equal(true);
    });

    it('gives up after the retry budget is exhausted on persistent ENOENT', async () => {
        subscribeStub = sinon.stub(parcel, 'subscribe').callsFake(async () => {
            throw new Error('No such file or directory at /tmp/rotated-log');
        });

        await service.watchFileChanges(0, root.toString());
        // Total backoff is 100+200+300+400 = 1000ms; leave a margin for scheduling.
        await new Promise(resolve => setTimeout(resolve, 1700));

        // Initial attempt + 4 retries = 5 total subscribe calls.
        expect(subscribeStub.callCount, 'should retry up to the budget then give up').to.equal(5);
        expect(onError.called, 'error must surface once the retry budget is exhausted').to.equal(true);
    });
});
