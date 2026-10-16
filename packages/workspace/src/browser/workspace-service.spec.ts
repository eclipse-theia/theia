// *****************************************************************************
// Copyright (C) 2026 Vinay Kaushal and others.
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
try { FrontendApplicationConfigProvider.set({}); } catch { /* already set by a sibling spec */ }

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { WorkspaceData, WorkspaceService } from './workspace-service';

after(() => disableJSDOM());

describe('WorkspaceData', () => {

    const workspaceFile = FileStat.file('file:///home/user/project/project.theia-workspace');

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
    });
});

describe('WorkspaceService', () => {

    const backend = 'file:///home/user/project/backend';
    const frontend = 'file:///home/user/project/frontend';
    const shared = 'file:///home/user/shared';

    class TestWorkspaceService extends WorkspaceService {
        computedRoots: FileStat[] = [];
        names = new Map<string, string>();
        fileData: WorkspaceData | undefined;
        writtenData: WorkspaceData | undefined;
        protected override async computeRoots(): Promise<FileStat[]> {
            this.rootNames = this.names;
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

    describe('getWorkspaceRootName()', () => {

        it('should return the name of a root', async () => {
            service.names = new Map([[backend, 'API Server']]);
            await service.updateRoots();
            expect(service.getWorkspaceRootName(new URI(backend))).to.equal('API Server');
            expect(service.getWorkspaceRootName(new URI(`${backend}/`))).to.equal('API Server');
        });

        it('should return undefined for a root without a name', async () => {
            await service.updateRoots();
            expect(service.getWorkspaceRootName(new URI(backend))).to.be.undefined;
        });
    });

    describe('updateRoots()', () => {

        it('should fire onWorkspaceChanged when only the name of a root changes', async () => {
            await service.updateRoots();
            expect(changeEvents).to.equal(1);

            service.names = new Map([[backend, 'API Server']]);
            await service.updateRoots();
            expect(changeEvents).to.equal(2);
            expect(service.getWorkspaceRootName(new URI(backend))).to.equal('API Server');
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
