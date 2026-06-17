// *****************************************************************************
// Copyright (C) 2026 Safi Seid-Ahmad, K2view and others.
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
import { Options } from '@theia/core/shared/@parcel/watcher';
import { ParcelFileSystemWatcherService } from './parcel-filesystem-service';

// We require the *same* module object that the production code imports from, so that
// stubbing its `subscribe` export is observed by `ParcelWatcher`. The `@theia/core/shared`
// shim simply re-exports `require('@parcel/watcher')`, so this is the identical reference.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const parcel = require('@theia/core/shared/@parcel/watcher');

const expect = chai.expect;
const track = temp.track();

/**
 * Reproduces the `files.watcherExclude` / exclude leak:
 *
 * Excludes flow `files.watcherExclude` -> `WatchOptions.excludes`
 * -> `disk-file-system-provider` (`{ ignored }`) -> `ParcelWatcherOptions.ignored`.
 * However `ParcelWatcher.createWatcher()` only uses `ignored` to *filter events after they
 * arrive* (`isIgnored`/`pushFileChange`). It never passes them to the native `@parcel/watcher`
 * `subscribe(..., { ignore })` option, so excluded directories are STILL crawled and given
 * inotify watches. On large workspaces this exhausts `fs.inotify.max_user_watches`
 * ("Unable to watch for file changes in this large workspace.") even though the user
 * configured excludes that should have pruned those directories.
 */
describe('parcel-filesystem-watcher exclude handling', function (): void {

    this.timeout(20000);

    let root: URI;
    let service: ParcelFileSystemWatcherService;
    let subscribeStub: sinon.SinonStub;
    let capturedOptions: Options[];

    beforeEach(() => {
        const tempPath = temp.mkdirSync('parcel-exclude-root');
        root = FileUri.create(fs.realpathSync(tempPath));
        capturedOptions = [];
        // Stub the native parcel `subscribe` so we can inspect the options Theia passes to it
        // (and so the test does not place real OS watches).
        subscribeStub = sinon.stub(parcel, 'subscribe').callsFake(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            async (_dir: string, _cb: any, opts: Options) => {
                capturedOptions.push(opts);
                return { unsubscribe: async () => undefined };
            });
        service = new ParcelFileSystemWatcherService({ verbose: false });
    });

    afterEach(() => {
        subscribeStub.restore();
        service.dispose();
        track.cleanupSync();
    });

    it('passes the configured excludes to the native parcel `ignore` option so excluded directories are not watched', async () => {
        const excludePattern = '**/node_modules/**';

        await service.watchFileChanges(0, root.toString(), { ignored: [excludePattern] });
        // Allow ParcelWatcher.start() (stat + subscribe) to run.
        await new Promise(resolve => setTimeout(resolve, 300));

        expect(subscribeStub.called, 'native parcel subscribe should have been called').to.equal(true);

        const opts = capturedOptions[0] ?? {};
        expect(opts.ignore, 'parcel subscribe options should carry an `ignore` list built from the excludes').to.not.equal(undefined);
        expect(opts.ignore, 'the configured exclude pattern should be passed to parcel `ignore`').to.include(excludePattern);
    });

});
