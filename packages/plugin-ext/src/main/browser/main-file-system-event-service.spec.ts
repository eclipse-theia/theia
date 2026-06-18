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

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import * as assert from 'assert';
import { URI } from '@theia/core';
import { Disposable } from '@theia/core/lib/common/disposable';
import { UriComponents } from '../../common/uri-components';
import { MainFileSystemEventService } from './main-file-system-event-service';

disableJSDOM();

/* eslint-disable @typescript-eslint/no-explicit-any */

// A language server (e.g. `redhat.java` / JDT-LS) registers a watcher rooted at the PARENT of the
// workspace folder - `RelativePattern(parentDir, folderName)` - purely to detect deletion of the
// workspace folder itself. The pattern has no globstar, so `ensureWatching` sends it as a
// NON-recursive `$watch` on `parentDir`. Theia's backend ignores the `recursive` flag and always
// watches recursively, so this turns into a recursive crawl of every sibling subtree under the
// parent - thousands of inodes the workspace does not own - which can exhaust the OS file-watch
// budget. `files.watcherExclude` cannot bound it because the root is outside the workspace.
//
// These tests pin the fix: a non-recursive watch rooted at a strict ancestor of a workspace root is
// not registered, while watches on/inside the workspace and explicit recursive requests are
// untouched.
describe('MainFileSystemEventService ancestor-of-workspace watch handling', () => {

    function componentsFor(path: string): UriComponents {
        return { scheme: 'file', authority: '', path, query: '', fragment: '' };
    }

    function createService(rootUris: string[], watchCalls: UriComponents[]): MainFileSystemEventService {
        const fileService: any = {
            onDidFilesChange: () => Disposable.NULL,
            onDidRunUserOperation: () => Disposable.NULL,
            addFileOperationParticipant: () => Disposable.NULL,
            watch: (resource: UriComponents) => {
                watchCalls.push(resource);
                return Disposable.NULL;
            }
        };
        const workspaceService: any = { tryGetRoots: () => rootUris.map(uri => ({ resource: new URI(uri) })) };
        const rpc: any = { getProxy: () => ({}) };
        return new MainFileSystemEventService(rpc, {} as any, fileService, workspaceService);
    }

    it('skips a non-recursive watch rooted at a strict ancestor of a workspace root', () => {
        const watchCalls: UriComponents[] = [];
        const service = createService(['file:///projects/my-app'], watchCalls);

        service.$watch(1, componentsFor('/projects'), { recursive: false, excludes: [] });

        assert.strictEqual(watchCalls.length, 0, 'ancestor-of-workspace watch must not be registered');
    });

    it('still registers a non-recursive watch on the workspace root itself', () => {
        const watchCalls: UriComponents[] = [];
        const service = createService(['file:///projects/my-app'], watchCalls);

        service.$watch(1, componentsFor('/projects/my-app'), { recursive: false, excludes: [] });

        assert.strictEqual(watchCalls.length, 1);
    });

    it('still registers a non-recursive watch on an outer root that is itself the parent of another root', () => {
        const watchCalls: UriComponents[] = [];
        // Multi-root workspace where `/projects` is a root AND the parent of the `/projects/my-app` root.
        // The outer root is explicitly opened by the user, so its watch must not be dropped as an
        // "ancestor of the workspace".
        const service = createService(['file:///projects', 'file:///projects/my-app'], watchCalls);

        service.$watch(1, componentsFor('/projects'), { recursive: false, excludes: [] });

        assert.strictEqual(watchCalls.length, 1, 'a folder that is itself a workspace root must be watched, even if it is an ancestor of another root');
    });

    it('still registers a non-recursive watch inside the workspace', () => {
        const watchCalls: UriComponents[] = [];
        const service = createService(['file:///projects/my-app'], watchCalls);

        service.$watch(1, componentsFor('/projects/my-app/src'), { recursive: false, excludes: [] });

        assert.strictEqual(watchCalls.length, 1);
    });

    it('does not skip an explicit recursive watch on an ancestor (honored as requested)', () => {
        const watchCalls: UriComponents[] = [];
        const service = createService(['file:///projects/my-app'], watchCalls);

        service.$watch(1, componentsFor('/projects'), { recursive: true, excludes: [] });

        assert.strictEqual(watchCalls.length, 1);
    });

    it('frees the session for a skipped watch so $unwatch and re-watch do not throw', () => {
        const watchCalls: UriComponents[] = [];
        const service = createService(['file:///projects/my-app'], watchCalls);

        service.$watch(1, componentsFor('/projects'), { recursive: false, excludes: [] });
        service.$unwatch(1);
        // Re-using the same session id must not throw "already a watch request".
        service.$watch(1, componentsFor('/projects'), { recursive: false, excludes: [] });

        assert.strictEqual(watchCalls.length, 0);
    });

});
