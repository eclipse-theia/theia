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

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import * as assert from 'assert';
import { Disposable } from '@theia/core/lib/common/disposable';
import { WatchOptions } from '@theia/filesystem/lib/common/files';
import { UriComponents } from '../../common/uri-components';
import { MainFileSystemEventService } from './main-file-system-event-service';

disableJSDOM();

/* eslint-disable @typescript-eslint/no-explicit-any */

// A VS Code plugin (e.g. `redhat.java` hosting JDT-LS) that calls
// `vscode.workspace.createFileSystemWatcher` with a `RelativePattern` rooted at an absolute base
// triggers `ExtHostFileSystemEventService.ensureWatching`, which sends `$watch` to this main-side
// service with an EMPTY `excludes` list. As a result the user's `files.watcherExclude` preference
// was never applied to these (often sibling-of-workspace) recursive watches, so they crawled and
// watched whole external trees, exhausting the OS file-watch budget.
//
// This test pins the fix: the main side must merge the configured `files.watcherExclude` patterns
// into the watch options before delegating to the `FileService`.
describe('MainFileSystemEventService files.watcherExclude handling', () => {

    function componentsFor(path: string): UriComponents {
        return { scheme: 'file', authority: '', path, query: '', fragment: '' };
    }

    it('applies files.watcherExclude to plugin-created watches that arrive with empty excludes', () => {
        const watchCalls: WatchOptions[] = [];

        const fileService: any = {
            onDidFilesChange: () => Disposable.NULL,
            onDidRunUserOperation: () => Disposable.NULL,
            addFileOperationParticipant: () => Disposable.NULL,
            watch: (_resource: any, options: WatchOptions) => {
                watchCalls.push(options);
                return Disposable.NULL;
            }
        };

        const preferences: any = {
            get: (preferenceName: string) => preferenceName === 'files.watcherExclude'
                ? { '**/node_modules/**': true, '**/.git/objects/**': true, '**/disabled-exclude/**': false }
                : undefined
        };

        const rpc: any = { getProxy: () => ({}) };

        const service = new MainFileSystemEventService(rpc, {} as any, fileService, preferences);

        // Mirrors what `ensureWatching` sends for an absolute RelativePattern base outside the workspace.
        service.$watch(1, componentsFor('/outside/workspace/storage'), { recursive: true, excludes: [] });

        assert.strictEqual(watchCalls.length, 1, 'FileService.watch should have been called once');
        const excludes = watchCalls[0].excludes;
        assert.ok(excludes.includes('**/node_modules/**'), 'enabled watcherExclude pattern should be applied');
        assert.ok(excludes.includes('**/.git/objects/**'), 'enabled watcherExclude pattern should be applied');
        assert.ok(!excludes.includes('**/disabled-exclude/**'), 'patterns set to `false` must not be applied');
    });

});
