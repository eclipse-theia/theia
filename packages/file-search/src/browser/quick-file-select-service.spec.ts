// *****************************************************************************
// Copyright (C) 2026 1C-Soft LLC and others.
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
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { KeybindingRegistry, OpenerService, QuickAccessRegistry } from '@theia/core/lib/browser';
import { LabelProvider } from '@theia/core/lib/browser/label-provider';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { MessageService } from '@theia/core/lib/common/message-service';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { NavigationLocationService } from '@theia/editor/lib/browser/navigation/navigation-location-service';
import { NavigationLocation, Position } from '@theia/editor/lib/browser/navigation/navigation-location';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceSearchFilterService } from '@theia/workspace/lib/browser';
import { FileSearchService } from '../common/file-search-service.js';
import { FileQuickPickItem, QuickFileSelectService } from './quick-file-select-service.js';

disableJSDOM();

before(() => {
    disableJSDOM = enableJSDOM();
});
after(() => {
    disableJSDOM();
});

describe('QuickFileSelectService', () => {

    let service: QuickFileSelectService;
    let workspaceService: WorkspaceService;
    let navigationLocationService: { locations: sinon.SinonStub };
    let container: Container;

    const location = (uri: string): NavigationLocation => ({
        uri: new URI(uri),
        type: NavigationLocation.Type.CURSOR,
        context: Position.create(0, 0)
    });

    const setRoots = (roots: string[]): void => {
        (workspaceService.tryGetRoots as sinon.SinonStub).returns(roots.map(root => FileStat.dir(root)));
    };

    const setLocations = (uris: string[]): void => {
        navigationLocationService.locations.returns(uris.map(location));
    };

    const recentFileUris = async (query: string): Promise<string[]> => {
        const picks = await service.getPicks(query);
        return picks.filter(FileQuickPickItem.is).map(item => item.uri.toString());
    };

    beforeEach(() => {
        container = new Container();

        // Use a real WorkspaceService so that the closest-root lookup of
        // `getWorkspaceRootUri` runs, with only the roots stubbed.
        workspaceService = new WorkspaceService();
        sinon.stub(workspaceService, 'tryGetRoots').returns([]);

        navigationLocationService = { locations: sinon.stub().returns([]) };

        container.bind(WorkspaceService).toConstantValue(workspaceService);
        container.bind(NavigationLocationService).toConstantValue(navigationLocationService as unknown as NavigationLocationService);
        container.bind(PreferenceService).toConstantValue({
            get: () => true // `search.quickOpen.includeHistory` enabled
        });
        container.bind(LabelProvider).toConstantValue({
            getName: (uri: URI) => uri.path.base,
            getDetails: () => '',
            getIcon: () => ''
        } as unknown as LabelProvider);
        container.bind(FileSearchService).toConstantValue({
            // Always return a result so the non-empty query path keeps the recent items.
            find: async () => ['file:///workspace/dummy-result.txt']
        });
        container.bind(WorkspaceSearchFilterService).toConstantValue({
            getExclusionGlobs: () => []
        } as unknown as WorkspaceSearchFilterService);
        container.bind(KeybindingRegistry).toConstantValue({} as unknown as KeybindingRegistry);
        container.bind(OpenerService).toConstantValue({});
        container.bind(QuickAccessRegistry).toConstantValue({});
        container.bind(MessageService).toConstantValue({} as unknown as MessageService);
        // QuickInputService is @optional and left unbound.

        container.bind(QuickFileSelectService).toSelf();
        service = container.get(QuickFileSelectService);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('matching recent files within the workspace', () => {

        const root = 'file:///home/user/parentmatch/workspace';
        const recentFile = 'file:///home/user/parentmatch/workspace/a.txt';

        beforeEach(() => {
            setRoots([root]);
            setLocations([recentFile]);
        });

        it('should not match recent files by directories outside the workspace root', async () => {
            const uris = await recentFileUris('parentmatch');
            expect(uris).to.not.contain(recentFile);
        });

        it('should match recent files by their file name', async () => {
            const uris = await recentFileUris('a.txt');
            expect(uris).to.contain(recentFile);
        });

        it('should match recent files by a path relative to the workspace root', async () => {
            const nestedFile = 'file:///workspace/src/app/main.ts';
            setRoots(['file:///workspace']);
            setLocations([nestedFile]);

            const uris = await recentFileUris('app/main');
            expect(uris).to.contain(nestedFile);
        });

        it('should show recent files for an empty query', async () => {
            const uris = await recentFileUris('');
            expect(uris).to.contain(recentFile);
        });
    });

    describe('matching recent files outside the workspace', () => {

        it('should match against the full URI', async () => {
            const outsideFile = 'file:///elsewhere/outside.txt';
            setRoots(['file:///home/user/workspace']);
            setLocations([outsideFile]);

            const uris = await recentFileUris('elsewhere');
            expect(uris).to.contain(outsideFile);
        });
    });

    describe('matching recent files in multi-root workspaces', () => {

        it('should match by the path relative to the closest root', async () => {
            const nestedFile = 'file:///workspace/nested/deep/x.ts';
            setRoots(['file:///workspace', 'file:///workspace/nested']);
            setLocations([nestedFile]);

            const matching = await recentFileUris('deep');
            expect(matching).to.contain(nestedFile);

            const nonMatching = await recentFileUris('nested');
            expect(nonMatching).to.not.contain(nestedFile);
        });
    });
});
