// *****************************************************************************
// Copyright (C) 2026 robertjndw
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
// `FileService` transitively imports browser modules that touch `document` at load time.
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import { ILogger } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { UntitledWorkspaceService, WorkspaceFileService } from '@theia/workspace/lib/common';
import { BrowserOnlyPluginPathsService } from './browser-only-plugin-paths-service';

disableJSDOM();

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The directories of the browser local file system, enough of it for the path service. */
class FakeFileService {
    readonly directories = new Set<string>();

    async createFolder(uri: URI): Promise<void> {
        for (let current = uri; !current.path.isRoot; current = current.parent) {
            this.directories.add(current.path.toString());
        }
    }

    async fsPath(uri: URI): Promise<string> {
        return uri.path.toString();
    }

    async resolve(uri: URI): Promise<any> {
        const parent = uri.path.toString();
        const children = [...this.directories]
            .filter(directory => new URI(directory).parent.path.toString() === parent)
            .map(directory => ({ isDirectory: true, resource: new URI(directory) }));
        return { isDirectory: true, resource: uri, children };
    }

    async delete(uri: URI): Promise<void> {
        const prefix = `${uri.path.toString()}/`;
        for (const directory of [...this.directories]) {
            if (directory === uri.path.toString() || directory.startsWith(prefix)) {
                this.directories.delete(directory);
            }
        }
    }
}

describe('BrowserOnlyPluginPathsService', () => {

    let fileService: FakeFileService;
    let service: BrowserOnlyPluginPathsService;

    function createService(): BrowserOnlyPluginPathsService {
        const container = new Container();
        container.bind(BrowserOnlyPluginPathsService).toSelf().inSingletonScope();
        container.bind(ILogger).to(MockLogger);
        container.bind(FileService).toConstantValue(fileService as any);
        container.bind(WorkspaceFileService).toSelf().inSingletonScope();
        container.bind(UntitledWorkspaceService).toSelf().inSingletonScope();
        container.bind(EnvVariablesServer).toConstantValue({
            getConfigDirUri: async () => 'file:///.theia'
        } as EnvVariablesServer);
        return container.get(BrowserOnlyPluginPathsService);
    }

    /** A fake session folder name for the `session`th day of December 2025, e.g. `20251203T000000`. */
    function sessionFolderName(session: number): string {
        const day = String(session).padStart(2, '0');
        return `202512${day}T000000`;
    }

    function sessionFolderUri(session: number): URI {
        return new URI(`file:///.theia/logs/${sessionFolderName(session)}/host`);
    }

    beforeEach(() => {
        fileService = new FakeFileService();
        service = createService();
    });

    describe('host log path', () => {

        it('creates a session log folder', async () => {
            const logPath = await service.getHostLogPath();

            expect(logPath).to.match(/^\/\.theia\/logs\/\d{8}T\d{6}\/host$/);
            expect(fileService.directories).to.include(logPath);
        });

        it('resolves the log path only once', async () => {
            expect(await service.getHostLogPath()).to.equal(await service.getHostLogPath());
        });

        it('keeps the ten most recent session folders, the one of this session among them', async () => {
            for (let session = 1; session <= 12; session++) {
                await fileService.createFolder(sessionFolderUri(session));
            }

            const logPath = await service.getHostLogPath();

            const sessions = sessionFolders();
            expect(sessions).to.have.lengthOf(10);
            expect(logPath).to.contain(sessions.find(session => !session.startsWith('/.theia/logs/202512')));
            // the three oldest gave way to the folder of this session
            expect(sessions).to.not.include(`/.theia/logs/${sessionFolderName(1)}`);
            expect(sessions).to.not.include(`/.theia/logs/${sessionFolderName(3)}`);
            expect(sessions).to.include(`/.theia/logs/${sessionFolderName(4)}`);
            expect(sessions).to.include(`/.theia/logs/${sessionFolderName(12)}`);
        });

        it('never cleans up a folder that is not a session folder', async () => {
            for (let session = 1; session <= 12; session++) {
                await fileService.createFolder(sessionFolderUri(session));
            }
            await fileService.createFolder(new URI('file:///.theia/logs/not-a-session'));

            await service.getHostLogPath();
            // getHostLogPath() doesn't wait for the cleanup, so give it a tick to finish
            await new Promise(resolve => setImmediate(resolve));

            expect(fileService.directories).to.include('/.theia/logs/not-a-session');
        });

        function sessionFolders(): string[] {
            return [...fileService.directories].filter(directory => /^\/\.theia\/logs\/[^/]+$/.test(directory)).sort();
        }
    });

    describe('host storage path', () => {

        it('has nowhere to store while no workspace is open', async () => {
            expect(await service.getHostStoragePath(undefined, [])).to.be.undefined;
        });

        it('gives every workspace a storage folder of its own', async () => {
            const one = await service.getHostStoragePath('file:///one', []);
            const other = await service.getHostStoragePath('file:///other', []);

            expect(one).to.match(/^\/\.theia\/workspace-storage\/.+$/);
            expect(one).to.not.equal(other);
            expect(fileService.directories).to.include(one!);
        });

        it('gives a workspace the same storage folder in every session', async () => {
            expect(await service.getHostStoragePath('file:///one', [])).to.equal(await service.getHostStoragePath('file:///one', []));
        });

        it('keys the storage of an untitled workspace on its roots, which outlive its name', async () => {
            const roots = ['file:///a', 'file:///b'];
            const one = await service.getHostStoragePath('file:///.theia/workspaces/Untitled-1.theia-workspace', roots);
            // the same roots under the name the next session gives the untitled workspace
            const next = await service.getHostStoragePath('file:///.theia/workspaces/Untitled-2.theia-workspace', [...roots].reverse());

            expect(one).to.equal(next);
        });
    });
});
