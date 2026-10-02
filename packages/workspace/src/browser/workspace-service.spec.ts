// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH and others.
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
let disableJSDOM: (() => void) | undefined;

import { expect } from 'chai';
import URI from '@theia/core/lib/common/uri';
import { Disposable } from '@theia/core/lib/common/disposable';
import { ContributionProvider, ILogger } from '@theia/core';
import { FileStat } from '@theia/filesystem/lib/common/files';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { FileSystemPreferences } from '@theia/filesystem/lib/common';
import { WindowTitleService } from '@theia/core/lib/browser/window/window-title-service';
import { WorkspaceServer } from '../common';
import { WorkspaceOpenHandlerContribution, WorkspaceService } from './workspace-service';

function createMockStat(uri: URI, isDirectory = true): FileStat {
    return {
        resource: uri,
        isDirectory,
        isFile: !isDirectory,
        isSymbolicLink: false,
        isReadonly: false,
        name: uri.path.base
    };
}

class TestableWorkspaceService extends WorkspaceService {
    public mockUri: string | undefined = 'file:///workspace/test';
    public mockRoots: FileStat[] = [];
    public mockIsFile = false;

    constructor() {
        super();
        Object.assign(this, {
            fileService: {
                onDidFilesChange: () => Disposable.NULL,
                watch: () => Disposable.NULL,
                resolve: async (uri: URI) => createMockStat(uri, !this.mockIsFile),
                exists: async () => true,
                read: async () => ({ value: '{}' })
            } as unknown as FileService,
            fsPreferences: {
                onPreferenceChanged: () => Disposable.NULL
            } as unknown as FileSystemPreferences,
            server: {
                getRecentWorkspaces: async () => [],
                setMostRecentlyUsedWorkspace: async () => { }
            } as unknown as WorkspaceServer,
            openHandlerContribution: {
                getContributions: () => []
            } as unknown as ContributionProvider<WorkspaceOpenHandlerContribution>,
            windowTitleService: {
                update: () => { }
            } as unknown as WindowTitleService,
            logger: {
                error: () => { },
                warn: () => { },
                info: () => { },
                debug: () => { }
            } as unknown as ILogger
        });

        const defaultRoot = createMockStat(new URI('file:///workspace/test'), true);
        this.mockRoots = [defaultRoot];
    }

    public async testDoInit(): Promise<void> {
        return this.doInit();
    }

    public async testChangeRoots(newRoots: FileStat[]): Promise<void> {
        this.mockRoots = newRoots;
        await this.updateRoots();
    }

    protected override async getDefaultWorkspaceUri(): Promise<string | undefined> {
        return this.mockUri;
    }

    protected override async toFileStat(uriString: string | undefined): Promise<FileStat | undefined> {
        if (!uriString) {
            return undefined;
        }
        return createMockStat(new URI(uriString), !this.mockIsFile);
    }

    protected override async computeRoots(): Promise<FileStat[]> {
        return this.mockRoots;
    }

    protected override setURLFragment(): void { }
    protected override updateTitle(): void { }
    protected override async watchRoots(): Promise<void> { }
    protected override isRemoteSession(): boolean {
        return false;
    }
}

describe('WorkspaceService', () => {

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        if (disableJSDOM) {
            disableJSDOM();
        }
    });

    it('should not fire onWorkspaceChanged before ready promise resolves during initialization', async () => {
        let isReadyWhenEventFired: boolean | undefined;
        let eventFired = false;

        const service = new TestableWorkspaceService();
        service.onWorkspaceChanged(() => {
            eventFired = true;
            isReadyWhenEventFired = service.isReady;
        });

        expect(service.isReady).to.be.false;

        await service.testDoInit();
        await service.ready;

        expect(eventFired).to.be.true;
        expect(isReadyWhenEventFired).to.be.true;
        expect(service.isReady).to.be.true;
    });

    it('should allow listeners in onWorkspaceChanged to await workspaceService.ready without deadlock', async () => {
        let awaitReadyCompletedInListener = false;

        const service = new TestableWorkspaceService();
        service.onWorkspaceChanged(async () => {
            await service.ready;
            awaitReadyCompletedInListener = true;
        });

        await service.testDoInit();
        await service.ready;
        await Promise.resolve();

        expect(awaitReadyCompletedInListener).to.be.true;
    });

    it('should fire onWorkspaceChanged immediately for changes after initialization', async () => {
        const service = new TestableWorkspaceService();
        await service.testDoInit();
        expect(service.isReady).to.be.true;

        let changeFired = false;
        let rootsCount = 0;
        service.onWorkspaceChanged(roots => {
            changeFired = true;
            rootsCount = roots.length;
        });

        const newRoot = createMockStat(new URI('file:///workspace/second'), true);
        await service.testChangeRoots([newRoot]);

        expect(changeFired).to.be.true;
        expect(rootsCount).to.equal(1);
    });

    it('should not fire onWorkspaceLocationChanged before ready resolves', async () => {
        let isReadyWhenLocationChanged = false;
        let locationEventFired = false;

        const service = new TestableWorkspaceService();
        service.mockIsFile = true;
        service.onWorkspaceLocationChanged(() => {
            locationEventFired = true;
            isReadyWhenLocationChanged = service.isReady;
        });

        await service.testDoInit();
        await service.ready;

        expect(locationEventFired).to.be.true;
        expect(isReadyWhenLocationChanged).to.be.true;
    });

    it('should handle empty workspace initialization and fire onWorkspaceChanged after ready', async () => {
        let isReadyWhenEventFired: boolean | undefined;
        let eventFired = false;
        let rootsReceived: FileStat[] | undefined;

        const service = new TestableWorkspaceService();
        service.mockUri = undefined;
        service.mockRoots = [];

        service.onWorkspaceChanged(roots => {
            eventFired = true;
            isReadyWhenEventFired = service.isReady;
            rootsReceived = roots;
        });

        await service.testDoInit();
        await service.ready;

        expect(eventFired).to.be.true;
        expect(isReadyWhenEventFired).to.be.true;
        expect(rootsReceived?.length).to.equal(0);
    });

    it('should deliver initial onWorkspaceChanged event to listener subscribed in ready.then(...)', async () => {
        let eventReceived = false;
        let receivedRoots: FileStat[] | undefined;

        const service = new TestableWorkspaceService();
        service.ready.then(() => {
            service.onWorkspaceChanged(roots => {
                eventReceived = true;
                receivedRoots = roots;
            });
        });

        await service.testDoInit();

        expect(eventReceived).to.be.true;
        expect(receivedRoots?.length).to.equal(1);
    });
});
