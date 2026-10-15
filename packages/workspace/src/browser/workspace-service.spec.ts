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
FrontendApplicationConfigProvider.set({});

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

    class TestWorkspaceService extends WorkspaceService {
        computedRoots: FileStat[] = [];
        names = new Map<string, string>();
        protected override async computeRoots(): Promise<FileStat[]> {
            return this.computedRoots;
        }
        protected override async computeRootNames(): Promise<Map<string, string>> {
            return this.names;
        }
        override updateRoots(): Promise<void> {
            return super.updateRoots();
        }
    }

    let service: TestWorkspaceService;
    let changeEvents: number;

    beforeEach(() => {
        service = new TestWorkspaceService();
        service.computedRoots = [FileStat.dir('file:///home/user/project/backend')];
        changeEvents = 0;
        service.onWorkspaceChanged(() => changeEvents++);
    });

    describe('getWorkspaceRootName()', () => {

        it('should return the name of a root', async () => {
            service.names = new Map([['file:///home/user/project/backend', 'API Server']]);
            await service.updateRoots();
            expect(service.getWorkspaceRootName(new URI('file:///home/user/project/backend'))).to.equal('API Server');
            expect(service.getWorkspaceRootName(new URI('file:///home/user/project/backend/'))).to.equal('API Server');
        });

        it('should return undefined for a root without a name', async () => {
            await service.updateRoots();
            expect(service.getWorkspaceRootName(new URI('file:///home/user/project/backend'))).to.be.undefined;
        });
    });

    describe('updateRoots()', () => {

        it('should fire onWorkspaceChanged when only the name of a root changes', async () => {
            await service.updateRoots();
            expect(changeEvents).to.equal(1);

            service.names = new Map([['file:///home/user/project/backend', 'API Server']]);
            await service.updateRoots();
            expect(changeEvents).to.equal(2);
            expect(service.getWorkspaceRootName(new URI('file:///home/user/project/backend'))).to.equal('API Server');
        });

        it('should not fire onWorkspaceChanged when neither the roots nor their names change', async () => {
            service.names = new Map([['file:///home/user/project/backend', 'API Server']]);
            await service.updateRoots();
            service.names = new Map([['file:///home/user/project/backend', 'API Server']]);
            await service.updateRoots();
            expect(changeEvents).to.equal(1);
        });
    });
});
