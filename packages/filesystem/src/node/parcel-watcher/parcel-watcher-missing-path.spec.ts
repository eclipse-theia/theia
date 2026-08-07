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
import * as temp from 'temp';
import * as fs from '@theia/core/shared/fs-extra';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node';
import { ParcelFileSystemWatcherService } from './parcel-filesystem-service';
import { FileChange, FileChangeType } from '../../common/filesystem-watcher-protocol';

const expect = chai.expect;
const track = temp.track();

/**
 * `ParcelWatcher.start()` waits for the watched path to exist before subscribing, so the
 * creation itself happens while nobody is subscribed and its event is lost. Clients then keep
 * the state they observed while the path was missing until the next change, e.g. the backend
 * preference service never picks up a `settings.json` that was created after startup.
 * See https://github.com/eclipse-theia/theia/issues/17842.
 */
describe('parcel-filesystem-watcher missing path handling', function (): void {

    this.timeout(20000);

    let root: URI;
    let service: ParcelFileSystemWatcherService;
    let changes: FileChange[];

    beforeEach(() => {
        root = FileUri.create(fs.realpathSync(temp.mkdirSync('parcel-missing-path-root')));
        changes = [];
        service = new ParcelFileSystemWatcherService({ verbose: false });
        service.setClient({
            onDidFilesChanged: event => changes.push(...event.changes),
            onError: () => undefined
        });
    });

    afterEach(() => {
        service.dispose();
        track.cleanupSync();
    });

    it('reports the creation of a watched file that did not exist when the watcher was requested', async () => {
        const file = root.resolve('settings.json');

        await service.watchFileChanges(0, file.toString());
        // The watcher is now polling for the path: nothing can be reported yet.
        await sleep(200);
        expect(changes, 'no change should be reported while the path does not exist').to.be.empty;

        fs.writeFileSync(FileUri.fsPath(file), '{ "breadcrumbs.enabled": false }');

        // The path is polled every 500ms, so allow a few intervals plus the subscribe.
        await waitFor(() => changes.some(change => change.uri === file.toString() && change.type === FileChangeType.ADDED), 5000);
    });

    it('reports subsequent changes of a watched file that did not exist when the watcher was requested', async () => {
        const file = root.resolve('settings.json');

        await service.watchFileChanges(0, file.toString());
        await sleep(200);
        fs.writeFileSync(FileUri.fsPath(file), '{ "breadcrumbs.enabled": false }');
        await waitFor(() => changes.some(change => change.uri === file.toString()), 5000);

        changes.length = 0;
        fs.writeFileSync(FileUri.fsPath(file), '{ "breadcrumbs.enabled": true }');
        await waitFor(() => changes.some(change => change.uri === file.toString()), 5000);
    });
});

function sleep(time: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, time));
}

async function waitFor(condition: () => boolean, timeout: number): Promise<void> {
    const deadline = Date.now() + timeout;
    while (!condition()) {
        if (Date.now() > deadline) {
            expect.fail(`condition was not met within ${timeout}ms`);
        }
        await sleep(50);
    }
}
