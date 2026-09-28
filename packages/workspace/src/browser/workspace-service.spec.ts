// *****************************************************************************
// Copyright (C) 2026 STMicroelectronics and others.
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

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { OS } from '@theia/core/lib/common/os';
import { WorkspaceService } from './workspace-service';

disableJSDOM();

describe('WorkspaceService root names', () => {

    let originalIsWindows: boolean;
    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });
    beforeEach(() => {
        // Paths outside the workspace are rendered with `Path.fsPath()`, which branches on the backend OS.
        originalIsWindows = OS.backend.isWindows;
        OS.backend.isWindows = false;
    });
    afterEach(() => {
        OS.backend.isWindows = originalIsWindows;
    });

    const workspaceWith = (...roots: string[]): WorkspaceService => Object.create(WorkspaceService.prototype, {
        tryGetRoots: { value: () => roots.map(root => ({ resource: new URI(root), isDirectory: true })) }
    });

    const namesOf = (service: WorkspaceService): Record<string, string> =>
        Object.fromEntries(Array.from(service.getRootNames(), ([name, uri]) => [name, uri.toString()]));

    describe('getRootNames', () => {

        it('names each root after its basename', () => {
            expect(namesOf(workspaceWith('file:///home/user/frontend', 'file:///home/user/backend'))).to.deep.equal({
                frontend: 'file:///home/user/frontend',
                backend: 'file:///home/user/backend'
            });
        });

        it('names all roots sharing a basename by the shortest tail that tells them apart', () => {
            expect(namesOf(workspaceWith('file:///bob/app', 'file:///alice/app', 'file:///home/other'))).to.deep.equal({
                'bob/app': 'file:///bob/app',
                'alice/app': 'file:///alice/app',
                other: 'file:///home/other'
            });
        });

        it('uses as many parent segments as needed', () => {
            expect(namesOf(workspaceWith('file:///a/src/app', 'file:///b/src/app', 'file:///b/lib/app'))).to.deep.equal({
                'a/src/app': 'file:///a/src/app',
                'b/src/app': 'file:///b/src/app',
                'lib/app': 'file:///b/lib/app'
            });
        });

        it('names a root with a shorter path than its peer by its whole path', () => {
            expect(namesOf(workspaceWith('file:///app', 'file:///x/app'))).to.deep.equal({
                app: 'file:///app',
                'x/app': 'file:///x/app'
            });
        });

        it('qualifies a name that another root name starts with', () => {
            expect(namesOf(workspaceWith('file:///work/alice', 'file:///home/alice/app', 'file:///home/bob/app'))).to.deep.equal({
                'work/alice': 'file:///work/alice',
                'alice/app': 'file:///home/alice/app',
                'bob/app': 'file:///home/bob/app'
            });
        });

        it('qualifies the longer name if the shorter one is a whole path', () => {
            expect(namesOf(workspaceWith('file:///alice', 'file:///home/alice/app', 'file:///home/bob/app'))).to.deep.equal({
                alice: 'file:///alice',
                'home/alice/app': 'file:///home/alice/app',
                'bob/app': 'file:///home/bob/app'
            });
        });

        it('does not qualify a name that the name of a root nested in it starts with', () => {
            expect(namesOf(workspaceWith('file:///ws/x', 'file:///ws/x/app', 'file:///other/app'))).to.deep.equal({
                x: 'file:///ws/x',
                'x/app': 'file:///ws/x/app',
                'other/app': 'file:///other/app'
            });
        });

        it('does not depend on the order of the roots', () => {
            expect(namesOf(workspaceWith('file:///alice/app', 'file:///bob/app')))
                .to.deep.equal(namesOf(workspaceWith('file:///bob/app', 'file:///alice/app')));
        });

        it('falls back to the URI for roots with the same path', () => {
            expect(namesOf(workspaceWith('file:///x/app', 'memfs:/x/app'))).to.deep.equal({
                'file:///x/app': 'file:///x/app',
                'memfs:/x/app': 'memfs:/x/app'
            });
        });
    });

    describe('getRootPrefixedPath', () => {

        it('prefixes the path with the name of the root', () => {
            const service = workspaceWith('file:///alice/app', 'file:///bob/app');
            expect(service.getRootPrefixedPath(new URI('file:///bob/app/src/index.ts'))).to.equal('bob/app/src/index.ts');
            expect(service.getRootPrefixedPath(new URI('file:///bob/app'))).to.equal('bob/app');
        });

        it('uses the deepest root for nested roots', () => {
            const service = workspaceWith('file:///ws/theia', 'file:///ws/theia/packages/core');
            expect(service.getRootPrefixedPath(new URI('file:///ws/theia/packages/core/src/a.ts'))).to.equal('core/src/a.ts');
        });

        it('returns the absolute path for files outside the workspace', () => {
            const service = workspaceWith('file:///ws/theia');
            expect(service.getRootPrefixedPath(new URI('file:///tmp/a.ts'))).to.equal('/tmp/a.ts');
        });
    });

    describe('splitRootPrefixedPath', () => {

        const split = (service: WorkspaceService, path: string): { rootName: string; rootUri: string; rest: string } | undefined => {
            const result = service.splitRootPrefixedPath(path);
            return result && { ...result, rootUri: result.rootUri.toString() };
        };

        it('splits off the longest matching root name and keeps the rest as it is', () => {
            const service = workspaceWith('file:///ws/x', 'file:///ws/x/app', 'file:///other/app');
            expect(split(service, 'x/app/src/**/\\*.ts')).to.deep.equal({ rootName: 'x/app', rootUri: 'file:///ws/x/app', rest: 'src/**/\\*.ts' });
            expect(split(service, 'x/lib/{a,b}.ts')).to.deep.equal({ rootName: 'x', rootUri: 'file:///ws/x', rest: 'lib/{a,b}.ts' });
            expect(split(service, 'other/app')).to.deep.equal({ rootName: 'other/app', rootUri: 'file:///other/app', rest: '' });
        });

        it('does not split a path without a root name', () => {
            const service = workspaceWith('file:///alice/app', 'file:///bob/app');
            expect(split(service, 'app/src/index.ts')).to.be.undefined;
        });
    });

    describe('resolveRootPrefixedPath', () => {

        const resolve = (service: WorkspaceService, path: string): string | undefined => service.resolveRootPrefixedPath(path)?.toString();

        it('resolves a path relative to the named root', () => {
            const service = workspaceWith('file:///home/user/frontend', 'file:///home/user/backend');
            expect(resolve(service, 'backend/src/index.ts')).to.equal('file:///home/user/backend/src/index.ts');
            expect(resolve(service, 'backend')).to.equal('file:///home/user/backend');
        });

        it('resolves parent-qualified root names', () => {
            const service = workspaceWith('file:///alice/app', 'file:///bob/app');
            expect(resolve(service, 'bob/app/src/index.ts')).to.equal('file:///bob/app/src/index.ts');
            expect(resolve(service, 'alice/app')).to.equal('file:///alice/app');
        });

        it('does not resolve a basename shared by several roots', () => {
            const service = workspaceWith('file:///alice/app', 'file:///bob/app');
            expect(resolve(service, 'app/src/index.ts')).to.be.undefined;
        });

        it('prefers the longest matching root name', () => {
            const service = workspaceWith('file:///ws/x', 'file:///ws/x/app', 'file:///other/app');
            expect(resolve(service, 'x/app/src/index.ts')).to.equal('file:///ws/x/app/src/index.ts');
            expect(resolve(service, 'x/lib/index.ts')).to.equal('file:///ws/x/lib/index.ts');
        });

        it('accepts backslashes and redundant segments', () => {
            const service = workspaceWith('file:///home/user/backend');
            expect(resolve(service, 'backend\\src\\index.ts')).to.equal('file:///home/user/backend/src/index.ts');
            expect(resolve(service, './backend/src/../lib/a.ts')).to.equal('file:///home/user/backend/lib/a.ts');
        });

        it('does not resolve absolute paths, URIs or paths leaving the root', () => {
            const service = workspaceWith('file:///home/user/backend');
            expect(resolve(service, '/home/user/backend/a.ts')).to.be.undefined;
            expect(resolve(service, 'C:\\backend\\a.ts')).to.be.undefined;
            expect(resolve(service, 'file:///home/user/backend/a.ts')).to.be.undefined;
            expect(resolve(service, 'backend/../../etc/passwd')).to.be.undefined;
        });

        it('does not resolve paths without a root name', () => {
            const service = workspaceWith('file:///home/user/backend');
            expect(resolve(service, 'src/index.ts')).to.be.undefined;
        });

        it('is the inverse of getRootPrefixedPath', () => {
            const service = workspaceWith('file:///alice/app', 'file:///bob/app', 'file:///ws/theia', 'file:///ws/theia/packages/core');
            for (const file of ['file:///alice/app/a.ts', 'file:///bob/app/a.ts', 'file:///ws/theia/b.ts', 'file:///ws/theia/packages/core/c.ts']) {
                expect(resolve(service, service.getRootPrefixedPath(new URI(file)))).to.equal(file);
            }
        });

        it('is the inverse of getRootPrefixedPath for a root with a folder named like another root', () => {
            const service = workspaceWith('file:///work/alice', 'file:///home/alice/app', 'file:///home/bob/app');
            for (const file of ['file:///work/alice/app/x.ts', 'file:///home/alice/app/x.ts']) {
                expect(resolve(service, service.getRootPrefixedPath(new URI(file)))).to.equal(file);
            }
        });
    });
});
