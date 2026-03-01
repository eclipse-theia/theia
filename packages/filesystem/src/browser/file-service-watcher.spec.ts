// *****************************************************************************
// Copyright (C) 2025 and others.
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
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { Disposable, URI } from '@theia/core';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { FileSystemProvider, FileSystemProviderCapabilities, WatchOptions } from '../common/files';
import { FileService } from './file-service';

disableJSDOM();

interface MockWatcher {
    resource: URI;
    options: WatchOptions;
    disposed: boolean;
    disposable: Disposable;
}

function createMockProvider(caseSensitive: boolean = true): FileSystemProvider & { watchers: MockWatcher[] } {
    const watchers: MockWatcher[] = [];
    return {
        watchers,
        capabilities: caseSensitive ? FileSystemProviderCapabilities.PathCaseSensitive : 0,
        onDidChangeCapabilities: () => Disposable.NULL,
        onDidChangeFile: () => Disposable.NULL,
        onFileWatchError: () => Disposable.NULL,
        watch(resource: URI, options: WatchOptions): Disposable {
            const watcher: MockWatcher = {
                resource,
                options,
                disposed: false,
                disposable: Disposable.create(() => { watcher.disposed = true; }),
            };
            watchers.push(watcher);
            return watcher.disposable;
        },
        stat: () => { throw new Error('not implemented'); },
        readdir: () => { throw new Error('not implemented'); },
        readFile: () => { throw new Error('not implemented'); },
        writeFile: () => { throw new Error('not implemented'); },
        delete: () => { throw new Error('not implemented'); },
        mkdir: () => { throw new Error('not implemented'); },
        rename: () => { throw new Error('not implemented'); },
    } as FileSystemProvider & { watchers: MockWatcher[] };
}

/** Return the number of watchers that are still alive (not disposed). */
function liveWatcherCount(provider: { watchers: MockWatcher[] }): number {
    return provider.watchers.filter(w => !w.disposed).length;
}

describe('FileService watcher deduplication', () => {
    const sandbox = sinon.createSandbox();
    let fileService: FileService;
    let mockProvider: FileSystemProvider & { watchers: MockWatcher[] };

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        sandbox.restore();
        fileService = new FileService();
        mockProvider = createMockProvider();
        sandbox.stub(fileService as any, 'withProvider').resolves(mockProvider);
    });

    afterEach(() => {
        sandbox.restore();
    });

    // ── (A) Exact-match dedup ──────────────────────────────────────────

    describe('exact-match dedup', () => {
        it('should reuse an existing watcher for the same resource and options', async () => {
            const uri = new URI('file:///project/src');
            const opts: WatchOptions = { recursive: true, excludes: [] };

            const d1 = await fileService.doWatch(uri, opts);
            const d2 = await fileService.doWatch(uri, opts);

            // Only one real OS watcher should have been created
            expect(mockProvider.watchers).to.have.lengthOf(1);
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            // Disposing one handle should NOT dispose the real watcher
            d2.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            // Disposing the last handle should dispose it
            d1.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(0);
        });

        it('should subsume a second recursive watcher on the same URI with different excludes', async () => {
            const uri = new URI('file:///project/src');
            const opts1: WatchOptions = { recursive: true, excludes: ['**/node_modules'] };
            const opts2: WatchOptions = { recursive: true, excludes: [] };

            const d1 = await fileService.doWatch(uri, opts1);
            const d2 = await fileService.doWatch(uri, opts2);

            // The first recursive watcher subsumes the second (same URI, covered by parent match)
            expect(mockProvider.watchers).to.have.lengthOf(1);

            d2.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            d1.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(0);
        });

        it('should subsume a non-recursive watcher on the same URI as a recursive watcher', async () => {
            const uri = new URI('file:///project/src');
            const opts1: WatchOptions = { recursive: true, excludes: [] };
            const opts2: WatchOptions = { recursive: false, excludes: [] };

            const d1 = await fileService.doWatch(uri, opts1);
            const d2 = await fileService.doWatch(uri, opts2);

            // The recursive watcher subsumes the non-recursive one on the same URI
            expect(mockProvider.watchers).to.have.lengthOf(1);

            d2.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            d1.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(0);
        });

        it('should support three refs and only dispose when all are gone', async () => {
            const uri = new URI('file:///project/src');
            const opts: WatchOptions = { recursive: false, excludes: [] };

            const d1 = await fileService.doWatch(uri, opts);
            const d2 = await fileService.doWatch(uri, opts);
            const d3 = await fileService.doWatch(uri, opts);

            expect(mockProvider.watchers).to.have.lengthOf(1);

            d1.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            d2.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            d3.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(0);
        });
    });

    // ── (B) Parent subsumption of new child ────────────────────────────

    describe('parent subsumption', () => {
        it('should not create an OS watcher when a recursive parent already covers the child', async () => {
            const parentUri = new URI('file:///project');
            const childUri = new URI('file:///project/src');

            await fileService.doWatch(parentUri, { recursive: true, excludes: [] });
            await fileService.doWatch(childUri, { recursive: false, excludes: [] });

            // Only the parent's OS watcher should exist
            expect(mockProvider.watchers).to.have.lengthOf(1);
            expect(mockProvider.watchers[0].resource.toString()).to.equal(parentUri.toString());
        });

        it('should not subsume a child that is excluded by the parent', async () => {
            const parentUri = new URI('file:///project');
            const childUri = new URI('file:///project/node_modules/foo');

            await fileService.doWatch(parentUri, { recursive: true, excludes: ['**/node_modules'] });
            await fileService.doWatch(childUri, { recursive: false, excludes: [] });

            // The child should get its own real watcher
            expect(mockProvider.watchers).to.have.lengthOf(2);
        });

        it('should not subsume when the parent is non-recursive', async () => {
            const parentUri = new URI('file:///project');
            const childUri = new URI('file:///project/src');

            await fileService.doWatch(parentUri, { recursive: false, excludes: [] });
            await fileService.doWatch(childUri, { recursive: false, excludes: [] });

            expect(mockProvider.watchers).to.have.lengthOf(2);
        });

        it('should subsume a deeply nested child', async () => {
            const parentUri = new URI('file:///project');
            const childUri = new URI('file:///project/src/main/java/com/example');

            await fileService.doWatch(parentUri, { recursive: true, excludes: [] });
            await fileService.doWatch(childUri, { recursive: false, excludes: [] });

            expect(mockProvider.watchers).to.have.lengthOf(1);
        });

        it('should not subsume a sibling directory', async () => {
            const parentUri = new URI('file:///project/src');
            const siblingUri = new URI('file:///project/test');

            await fileService.doWatch(parentUri, { recursive: true, excludes: [] });
            await fileService.doWatch(siblingUri, { recursive: false, excludes: [] });

            expect(mockProvider.watchers).to.have.lengthOf(2);
        });

        it('should not subsume a child when it is under an excluded ancestor directory', async () => {
            const parentUri = new URI('file:///project');
            // node_modules is excluded, so anything under it should not be subsumed
            const childUri = new URI('file:///project/node_modules/pkg/lib');

            await fileService.doWatch(parentUri, { recursive: true, excludes: ['**/node_modules'] });
            await fileService.doWatch(childUri, { recursive: true, excludes: [] });

            // Child needs its own watcher since it's under an excluded directory
            expect(mockProvider.watchers).to.have.lengthOf(2);
        });
    });

    // ── (D) New recursive parent subsumes existing children ────────────

    describe('child subsumption by new parent', () => {
        it('should subsume existing non-recursive children when a new recursive parent is created', async () => {
            const childUri1 = new URI('file:///project/src');
            const childUri2 = new URI('file:///project/test');
            const parentUri = new URI('file:///project');

            await fileService.doWatch(childUri1, { recursive: false, excludes: [] });
            await fileService.doWatch(childUri2, { recursive: false, excludes: [] });

            expect(mockProvider.watchers).to.have.lengthOf(2);
            expect(liveWatcherCount(mockProvider)).to.equal(2);

            // Adding a recursive parent should subsume both children
            await fileService.doWatch(parentUri, { recursive: true, excludes: [] });

            // Three watchers created total, but only the parent should remain live
            expect(mockProvider.watchers).to.have.lengthOf(3);
            expect(liveWatcherCount(mockProvider)).to.equal(1);
            expect(mockProvider.watchers[0].disposed).to.be.true;  // child1 real watcher disposed
            expect(mockProvider.watchers[1].disposed).to.be.true;  // child2 real watcher disposed
            expect(mockProvider.watchers[2].disposed).to.be.false; // parent alive
        });

        it('should subsume existing recursive children and re-parent grandchildren', async () => {
            const grandchildUri = new URI('file:///project/src/deep');
            const childUri = new URI('file:///project/src');
            const parentUri = new URI('file:///project');

            // Create a recursive child first, then a grandchild under it
            await fileService.doWatch(childUri, { recursive: true, excludes: [] });
            await fileService.doWatch(grandchildUri, { recursive: false, excludes: [] });

            // Grandchild should already be subsumed by the child
            expect(mockProvider.watchers).to.have.lengthOf(1); // only child has a real watcher

            // Now create a parent that covers everything
            await fileService.doWatch(parentUri, { recursive: true, excludes: [] });

            // Child's real watcher gets disposed, parent takes over
            expect(liveWatcherCount(mockProvider)).to.equal(1);
            expect(mockProvider.watchers[0].disposed).to.be.true;  // child disposed
            expect(mockProvider.watchers[1].disposed).to.be.false; // parent alive
        });

        it('should not subsume excluded children when creating a new parent', async () => {
            const childUri = new URI('file:///project/node_modules/pkg');
            const parentUri = new URI('file:///project');

            await fileService.doWatch(childUri, { recursive: false, excludes: [] });
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            // Parent excludes node_modules
            await fileService.doWatch(parentUri, { recursive: true, excludes: ['**/node_modules'] });

            // Child should NOT be subsumed — both watchers should remain live
            expect(liveWatcherCount(mockProvider)).to.equal(2);
        });
    });

    // ── Disposal and promotion ─────────────────────────────────────────

    describe('disposal and promotion', () => {
        it('should promote subsumed children by creating real watchers when the parent is disposed', async () => {
            const parentUri = new URI('file:///project');
            const childUri = new URI('file:///project/src');

            const parentDisposable = await fileService.doWatch(parentUri, { recursive: true, excludes: [] });
            await fileService.doWatch(childUri, { recursive: false, excludes: [] });

            // Only parent watcher is real
            expect(mockProvider.watchers).to.have.lengthOf(1);

            // Dispose the parent
            parentDisposable.dispose();

            // Child should now have its own real watcher
            expect(liveWatcherCount(mockProvider)).to.equal(1);
            // The new watcher (index 1) should be for the child
            expect(mockProvider.watchers).to.have.lengthOf(2);
            expect(mockProvider.watchers[0].disposed).to.be.true;  // parent
            expect(mockProvider.watchers[1].disposed).to.be.false; // child promoted
            expect(mockProvider.watchers[1].resource.toString()).to.equal(childUri.toString());
        });

        it('should re-parent children to another existing parent on disposal', async () => {
            const grandparentUri = new URI('file:///project');
            const parentUri = new URI('file:///project/src');
            const childUri = new URI('file:///project/src/components');

            // Create grandparent, then parent, then child
            await fileService.doWatch(grandparentUri, { recursive: true, excludes: [] });
            const parentDisposable = await fileService.doWatch(parentUri, { recursive: true, excludes: [] });
            await fileService.doWatch(childUri, { recursive: false, excludes: [] });

            // Grandparent subsumed parent; parent did not get a real watcher.
            // Child was also subsumed (by grandparent after re-parenting).
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            // Dispose the parent
            parentDisposable.dispose();

            // Grandparent still covers the child — no new OS watcher needed
            expect(liveWatcherCount(mockProvider)).to.equal(1);
        });

        it('should promote multiple children when a parent is disposed', async () => {
            const parentUri = new URI('file:///project');
            const child1Uri = new URI('file:///project/src');
            const child2Uri = new URI('file:///project/test');
            const child3Uri = new URI('file:///project/docs');

            const parentDisposable = await fileService.doWatch(parentUri, { recursive: true, excludes: [] });
            await fileService.doWatch(child1Uri, { recursive: false, excludes: [] });
            await fileService.doWatch(child2Uri, { recursive: false, excludes: [] });
            await fileService.doWatch(child3Uri, { recursive: false, excludes: [] });

            expect(mockProvider.watchers).to.have.lengthOf(1);

            parentDisposable.dispose();

            // All three children should now have their own real watchers
            expect(liveWatcherCount(mockProvider)).to.equal(3);
        });

        it('should handle disposing a subsumed child cleanly', async () => {
            const parentUri = new URI('file:///project');
            const childUri = new URI('file:///project/src');

            await fileService.doWatch(parentUri, { recursive: true, excludes: [] });
            const childDisposable = await fileService.doWatch(childUri, { recursive: false, excludes: [] });

            expect(mockProvider.watchers).to.have.lengthOf(1);

            // Disposing the subsumed child should not affect the parent's watcher
            childDisposable.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(1);
        });

        it('should handle dispose-then-rewatch correctly', async () => {
            const parentUri = new URI('file:///project');
            const childUri = new URI('file:///project/src');

            const parentDisposable = await fileService.doWatch(parentUri, { recursive: true, excludes: [] });
            await fileService.doWatch(childUri, { recursive: false, excludes: [] });

            parentDisposable.dispose();

            // Child is promoted, now re-create the parent
            const parentDisposable2 = await fileService.doWatch(parentUri, { recursive: true, excludes: [] });

            // The child should be subsumed again — its promoted watcher should be disposed
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            parentDisposable2.dispose();

            // Child promoted again
            expect(liveWatcherCount(mockProvider)).to.equal(1);
        });
    });

    // ── Exclude pattern matching ───────────────────────────────────────

    describe('exclude pattern matching', () => {
        it('should exclude with glob patterns using **', async () => {
            const parentUri = new URI('file:///project');
            const excludedChild = new URI('file:///project/dist/bundle.js');

            await fileService.doWatch(parentUri, { recursive: true, excludes: ['**/dist'] });
            await fileService.doWatch(excludedChild, { recursive: false, excludes: [] });

            // Should not be subsumed because dist is excluded
            expect(mockProvider.watchers).to.have.lengthOf(2);
        });

        it('should handle multiple exclude patterns', async () => {
            const parentUri = new URI('file:///project');
            const nmChild = new URI('file:///project/node_modules/pkg');
            const distChild = new URI('file:///project/dist/out');
            const srcChild = new URI('file:///project/src/main');

            await fileService.doWatch(parentUri, { recursive: true, excludes: ['**/node_modules', '**/dist'] });
            await fileService.doWatch(nmChild, { recursive: false, excludes: [] });
            await fileService.doWatch(distChild, { recursive: false, excludes: [] });
            await fileService.doWatch(srcChild, { recursive: false, excludes: [] });

            // nm and dist children need their own watchers; src is subsumed
            expect(mockProvider.watchers).to.have.lengthOf(3); // parent + nm + dist
        });

        it('should exclude based on ancestor directory matching', async () => {
            const parentUri = new URI('file:///project');
            // The exclude is for node_modules — anything under it should also be excluded
            const deepChild = new URI('file:///project/node_modules/pkg/lib/index.js');

            await fileService.doWatch(parentUri, { recursive: true, excludes: ['**/node_modules'] });
            await fileService.doWatch(deepChild, { recursive: false, excludes: [] });

            expect(mockProvider.watchers).to.have.lengthOf(2);
        });

        it('should not exclude a non-matching path', async () => {
            const parentUri = new URI('file:///project');
            const childUri = new URI('file:///project/src/node_modules_backup/file.ts');

            await fileService.doWatch(parentUri, { recursive: true, excludes: ['**/node_modules'] });
            await fileService.doWatch(childUri, { recursive: false, excludes: [] });

            // 'node_modules_backup' does not match '**/node_modules', so child should be subsumed
            expect(mockProvider.watchers).to.have.lengthOf(1);
        });
    });

    // ── Edge cases ─────────────────────────────────────────────────────

    describe('edge cases', () => {
        it('should promote a non-recursive watcher when its recursive same-URI subsumer is disposed', async () => {
            const uri = new URI('file:///project/src');
            const recursiveOpts: WatchOptions = { recursive: true, excludes: [] };
            const nonRecursiveOpts: WatchOptions = { recursive: false, excludes: [] };

            const d1 = await fileService.doWatch(uri, recursiveOpts);
            const d2 = await fileService.doWatch(uri, nonRecursiveOpts);

            // findSubstr matches exact URIs, so the recursive watcher subsumes the non-recursive one
            expect(mockProvider.watchers).to.have.lengthOf(1);

            // Disposing the recursive watcher promotes the non-recursive one
            d1.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            d2.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(0);
        });

        it('should handle double dispose gracefully', async () => {
            const uri = new URI('file:///project/src');
            const d1 = await fileService.doWatch(uri, { recursive: false, excludes: [] });

            d1.dispose();
            // Double dispose should not throw
            d1.dispose();
            expect(liveWatcherCount(mockProvider)).to.equal(0);
        });

        it('should handle many watchers under one parent', async () => {
            const parentUri = new URI('file:///project');
            await fileService.doWatch(parentUri, { recursive: true, excludes: [] });

            const childDisposables: Disposable[] = [];
            for (let i = 0; i < 20; i++) {
                const d = await fileService.doWatch(
                    new URI(`file:///project/dir${i}`),
                    { recursive: false, excludes: [] }
                );
                childDisposables.push(d);
            }

            // Only the parent's real watcher exists
            expect(mockProvider.watchers).to.have.lengthOf(1);
            expect(liveWatcherCount(mockProvider)).to.equal(1);

            // Dispose all children — parent still alive
            for (const d of childDisposables) {
                d.dispose();
            }
            expect(liveWatcherCount(mockProvider)).to.equal(1);
        });
    });
});
