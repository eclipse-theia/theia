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
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { OS } from '@theia/core/lib/common/os';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceData, WorkspaceService } from './workspace-service';

disableJSDOM();

describe('WorkspaceData', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    const workspaceFile = FileStat.file('file:///home/user/project/project.theia-workspace');

    describe('is()', () => {

        it('should accept a workspace file with a folder name that is not a string', () => {
            // Such a file loads as in VS Code, with the folder falling back to its folder name,
            // instead of opening without roots and dropping the other contents of the file on the next write.
            expect(WorkspaceData.is({ folders: [{ path: 'backend', name: 42 }], settings: { 'editor.tabSize': 2 } })).to.be.true;
            expect(WorkspaceData.is({ folders: [{ path: 'backend', name: {} }] })).to.be.true;
        });

        it('should still reject a workspace file without valid folders', () => {
            expect(WorkspaceData.is({ folders: [{ name: 'API Server' }] })).to.be.false;
            expect(WorkspaceData.is({ settings: {} })).to.be.false;
        });
    });

    describe('buildWorkspaceData()', () => {

        it('should keep the names of the folders that are still present', () => {
            const data = WorkspaceData.buildWorkspaceData(
                [FileStat.dir('file:///home/user/project/backend'), FileStat.dir('file:///home/user/project/frontend')],
                { folders: [{ path: 'file:///home/user/project/backend/', name: 'API Server' }, { path: 'file:///home/user/project/removed', name: 'Removed' }] }
            );
            expect(data.folders).to.deep.equal([
                { path: 'file:///home/user/project/backend', name: 'API Server' },
                { path: 'file:///home/user/project/frontend' }
            ]);
        });

        it('should use the name of a folder entry and fall back to the current name', () => {
            const data = WorkspaceData.buildWorkspaceData(
                [{ path: 'file:///home/user/project/backend' }, { path: 'file:///home/user/project/frontend', name: 'Web Client' }],
                { folders: [{ path: 'file:///home/user/project/backend', name: 'API Server' }, { path: 'file:///home/user/project/frontend', name: 'Old Name' }] }
            );
            expect(data.folders).to.deep.equal([
                { path: 'file:///home/user/project/backend', name: 'API Server' },
                { path: 'file:///home/user/project/frontend', name: 'Web Client' }
            ]);
        });
    });

    describe('transformToRelative()', () => {

        it('should keep the names of the folders', () => {
            const data = WorkspaceData.transformToRelative({
                folders: [{ path: 'file:///home/user/project/backend', name: 'API Server' }, { path: 'file:///home/user/project/frontend' }]
            }, workspaceFile);
            expect(data.folders).to.deep.equal([{ path: 'backend', name: 'API Server' }, { path: 'frontend' }]);
        });
    });

    describe('transformToAbsolute()', () => {

        it('should keep the names of the folders', () => {
            const data = WorkspaceData.transformToAbsolute({
                folders: [{ path: 'backend', name: 'API Server' }, { path: 'frontend' }]
            }, workspaceFile);
            expect(data.folders).to.deep.equal([
                { path: 'file:///home/user/project/backend', name: 'API Server' },
                { path: 'file:///home/user/project/frontend' }
            ]);
        });

        it('should drop folder names that are not strings and keep the rest of the file', () => {
            const data = WorkspaceData.transformToAbsolute({
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                folders: [{ path: 'backend', name: 42 as any }, { path: 'frontend', name: {} as any }],
                settings: { 'editor.tabSize': 2 }
            }, workspaceFile);
            expect(data.folders).to.deep.equal([
                { path: 'file:///home/user/project/backend' },
                { path: 'file:///home/user/project/frontend' }
            ]);
            expect(data.settings).to.deep.equal({ 'editor.tabSize': 2 });
        });
    });
});

describe('WorkspaceService', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });
    after(() => {
        disableJSDOM();
    });

    const backend = 'file:///home/user/project/backend';
    const frontend = 'file:///home/user/project/frontend';
    const shared = 'file:///home/user/shared';

    class TestWorkspaceService extends WorkspaceService {
        computedRoots: FileStat[] = [];
        names = new Map<string, string>();
        fileData: WorkspaceData | undefined;
        writtenData: WorkspaceData | undefined;
        protected override async computeRoots(): Promise<FileStat[]> {
            this.configuredRootNames = this.names;
            return this.computedRoots;
        }
        protected override async getWorkspaceDataFromFile(): Promise<WorkspaceData | undefined> {
            return this.fileData;
        }
        protected override async writeWorkspaceFile(workspaceFile: FileStat | undefined, workspaceData: WorkspaceData): Promise<FileStat | undefined> {
            this.writtenData = workspaceData;
            return workspaceFile;
        }
        protected override async updateWorkspace(): Promise<void> {
        }
        override updateRoots(): Promise<void> {
            return super.updateRoots();
        }
        setWorkspaceFile(workspaceFile: FileStat, roots: FileStat[]): void {
            this._workspace = workspaceFile;
            this._roots = roots;
        }
    }

    let service: TestWorkspaceService;
    let changeEvents: number;

    beforeEach(() => {
        service = new TestWorkspaceService();
        service.computedRoots = [FileStat.dir(backend)];
        changeEvents = 0;
        service.onWorkspaceChanged(() => changeEvents++);
    });

    describe('getConfiguredRootName()', () => {

        it('should return the name of a root', async () => {
            service.names = new Map([[backend, 'API Server']]);
            await service.updateRoots();
            expect(service.getConfiguredRootName(new URI(backend))).to.equal('API Server');
            expect(service.getConfiguredRootName(new URI(`${backend}/`))).to.equal('API Server');
        });

        it('should return undefined for a root without a name', async () => {
            await service.updateRoots();
            expect(service.getConfiguredRootName(new URI(backend))).to.be.undefined;
        });
    });

    describe('updateRoots()', () => {

        it('should fire onWorkspaceChanged when only the name of a root changes', async () => {
            await service.updateRoots();
            expect(changeEvents).to.equal(1);

            service.names = new Map([[backend, 'API Server']]);
            await service.updateRoots();
            expect(changeEvents).to.equal(2);
            expect(service.getConfiguredRootName(new URI(backend))).to.equal('API Server');
        });

        it('should not fire onWorkspaceChanged when neither the roots nor their names change', async () => {
            service.names = new Map([[backend, 'API Server']]);
            await service.updateRoots();
            service.names = new Map([[backend, 'API Server']]);
            await service.updateRoots();
            expect(changeEvents).to.equal(1);
        });
    });

    describe('writing the workspace file', () => {

        beforeEach(() => {
            service.setWorkspaceFile(FileStat.file('file:///home/user/project/project.theia-workspace'), [FileStat.dir(backend), FileStat.dir(frontend)]);
            service.fileData = { folders: [{ path: backend, name: 'API Server' }, { path: frontend }] };
        });

        it('should keep the names of the roots and write the name of an added root', async () => {
            await service.spliceRoots(2, 0, { uri: new URI(shared), name: 'Shared' }, new URI('file:///home/user/other'));
            expect(service.writtenData?.folders).to.deep.equal([
                { path: backend, name: 'API Server' },
                { path: frontend },
                { path: shared, name: 'Shared' },
                { path: 'file:///home/user/other' }
            ]);
        });

        it('should keep the names of the remaining roots when removing a root', async () => {
            await service.removeRoots([new URI(frontend)]);
            expect(service.writtenData?.folders).to.deep.equal([{ path: backend, name: 'API Server' }]);
        });
    });
});

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

        it('names a root listed twice once, after its basename', () => {
            expect(namesOf(workspaceWith('file:///home/user/app', 'file:///home/user/app'))).to.deep.equal({
                app: 'file:///home/user/app'
            });
        });

        it('returns the same names until the roots change', async () => {
            let roots = [FileStat.dir('file:///alice/app')];
            const service = new WorkspaceService();
            service['computeRoots'] = async () => roots;
            await service['updateRoots']();
            const names = service.getRootNames();
            expect(service.getRootNames()).to.equal(names);
            roots = [...roots, FileStat.dir('file:///bob/app')];
            await service['updateRoots']();
            expect(Array.from(service.getRootNames().keys())).to.deep.equal(['alice/app', 'bob/app']);
            expect(service.getRootName(new URI('file:///bob/app'))).to.equal('bob/app');
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

    describe('resolveSupraRelativePath', () => {

        const resolve = (service: WorkspaceService, path: string): string[] => service.resolveSupraRelativePath(path).map(uri => uri.toString());

        it('resolves a path that starts with the basename of a root', () => {
            const service = workspaceWith('file:///home/user/frontend', 'file:///home/user/backend');
            expect(resolve(service, 'backend/src/index.ts')).to.deep.equal(['file:///home/user/backend/src/index.ts']);
            expect(resolve(service, 'backend')).to.deep.equal(['file:///home/user/backend']);
        });

        it('resolves a path prefixed with more of the root path than its name', () => {
            const service = workspaceWith('file:///alice/app');
            expect(resolve(service, 'alice/app/src/index.ts')).to.deep.equal(['file:///alice/app/src/index.ts']);
            expect(resolve(service, 'bob/app/src/index.ts')).to.deep.equal([]);
        });

        it('resolves a basename shared by several roots in each of them', () => {
            const service = workspaceWith('file:///alice/app', 'file:///bob/app');
            expect(resolve(service, 'app/src/index.ts')).to.deep.equal(['file:///alice/app/src/index.ts', 'file:///bob/app/src/index.ts']);
            expect(resolve(service, 'bob/app/src/index.ts')).to.deep.equal(['file:///bob/app/src/index.ts']);
        });

        it('does not resolve absolute paths, paths leaving the root or paths without a root basename', () => {
            const service = workspaceWith('file:///home/user/backend');
            expect(resolve(service, '/home/user/backend/a.ts')).to.deep.equal([]);
            expect(resolve(service, 'C:\\backend\\a.ts')).to.deep.equal([]);
            expect(resolve(service, '../backend/a.ts')).to.deep.equal([]);
            expect(resolve(service, 'src/index.ts')).to.deep.equal([]);
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
