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
import * as cp from 'child_process';
import * as temp from 'temp';
import * as fs from '@theia/core/shared/fs-extra';
import URI from '@theia/core/lib/common/uri';
import { FileUri } from '@theia/core/lib/node';
import { ParcelWatcherTestService } from './test/parcel-watcher-test-service';
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
    let service: ParcelWatcherTestService;
    let changes: FileChange[];

    beforeEach(() => {
        let tempPath = temp.mkdirSync('parcel-missing-path-root');
        // Sometimes tempPath will use some Windows 8.3 short name in its path. This is a problem
        // since parcel always returns paths with long names. We need to convert here.
        // See: https://stackoverflow.com/a/34473971/7983255
        if (process.platform === 'win32') {
            tempPath = cp.execSync(`powershell "(Get-Item -LiteralPath '${tempPath}').FullName"`, {
                encoding: 'utf8',
            }).trim();
        }
        root = FileUri.create(fs.realpathSync(tempPath));
        changes = [];
        service = new ParcelWatcherTestService({ verbose: false });
        // Bind the array itself instead of the variable, so that events arriving while a
        // test is torn down cannot leak into the array of the next one.
        const ownChanges = changes;
        service.setClient({
            onDidFilesChanged: event => ownChanges.push(...event.changes),
            onError: () => undefined
        });
    });

    afterEach(async () => {
        // Unsubscribe before deleting the watched directories: deleting a still subscribed
        // root strands parcel's shared macOS FSEvents backend, see ParcelWatcherTestService.
        await service.disposeAllWatchers();
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

    // Creating symlinks on Windows requires elevated privileges or developer mode.
    (process.platform === 'win32' ? it.skip : it)('reports the creation under the same resolved path as the subsequent changes', async () => {
        const real = root.resolve('real');
        const link = root.resolve('link');
        fs.mkdirSync(FileUri.fsPath(real));
        fs.symlinkSync(FileUri.fsPath(real), FileUri.fsPath(link));
        const file = link.resolve('settings.json');
        const resolved = real.resolve('settings.json').toString();

        await service.watchFileChanges(0, file.toString());
        await sleep(200);
        fs.writeFileSync(FileUri.fsPath(file), '{ "breadcrumbs.enabled": false }');
        await waitFor(() => changes.some(change => change.type === FileChangeType.ADDED), 5000);

        // Parcel subscribes to the resolved path, so all its events are reported realpath'd. The
        // synthetic creation has to use the same path, otherwise clients which key on the URI see
        // two different resources for the same file.
        expect([...new Set(changes.map(change => change.uri))]).to.deep.equal([resolved]);
    });

    it('reports the creation of a watched directory, but not the entries it was populated with', async () => {
        const directory = root.resolve('config');

        await service.watchFileChanges(0, directory.toString());
        await sleep(200);
        // Populate the directory within the same poll interval as its creation. Those entries
        // predate the subscription just like the directory itself, but only the watched path is
        // reported. Clients which refresh recursively on the directory event, like the file tree,
        // still pick them up; clients which only react to concrete paths do not.
        fs.mkdirpSync(FileUri.fsPath(directory.resolve('nested')));
        fs.writeFileSync(FileUri.fsPath(directory.resolve('nested').resolve('settings.json')), '{}');
        await waitFor(() => changes.some(change => change.uri === directory.toString() && change.type === FileChangeType.ADDED), 5000);
        expect(changes.map(change => change.uri), 'only the watched directory should be reported').to.deep.equal([directory.toString()]);

        // The watcher is nevertheless live and reports entries created from now on.
        fs.writeFileSync(FileUri.fsPath(directory.resolve('keymaps.json')), '[]');
        await waitFor(() => changes.some(change => change.uri === directory.resolve('keymaps.json').toString()), 5000);
    });

    it('does not report a creation for a watched file that already exists', async () => {
        const file = root.resolve('settings.json');
        fs.writeFileSync(FileUri.fsPath(file), '{ "breadcrumbs.enabled": false }');

        await service.watchFileChanges(0, file.toString());
        // Allow more than one poll interval so a synthetic event would have been delivered by now.
        await sleep(1000);
        expect(changes, 'no change should be reported for an already existing path').to.be.empty;

        // The watcher is nevertheless live and reports actual changes. Only the URI is
        // checked: FSEvents on macOS coalesces flags per path, so parcel can legitimately
        // report this write as a creation instead of an update.
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
