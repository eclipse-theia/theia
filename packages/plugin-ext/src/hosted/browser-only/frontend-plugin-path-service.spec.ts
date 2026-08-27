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
// ****************************************************************************

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
// `FileService` transitively imports browser modules that touch `document` at load time.
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as sinon from 'sinon';
import { ILogger } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { Container } from '@theia/core/shared/inversify';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { UntitledWorkspaceService, WorkspaceFileService } from '@theia/workspace/lib/common';
import { FrontendPluginPathService } from './frontend-plugin-path-service';
import { installFakeLockManager } from './test/navigator-locks-test-util';

disableJSDOM();

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The directories of the browser local file system, enough of it for the path service. */
class FakeFileService {
    readonly directories = new Set<string>();

    async exists(uri: URI): Promise<boolean> {
        return this.directories.has(uri.path.toString());
    }

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

/** Mirrors the private `SESSION_LOCK_PREFIX` in the module under test. */
const SESSION_LOCK_PREFIX = 'theia:plugin-log-session:';

/**
 * Minimal stand-in for the browser's `LockManager` - just enough for this module: granting a
 * request (our lock names are always unique to one tab's session, so there's never contention)
 * and reporting held locks via `query()`.
 *
 * Grants go through {@link grantGate} instead of resolving in the same microtask as `request()`,
 * since the real API coordinates across tabs and can't grant instantly either. Swap it for a
 * `Deferred` in a test to control exactly when a grant happens.
 *
 * Set {@link rejectNextRequestWith} to make the next `request()` reject without ever calling its
 * callback, which the real API can also do (e.g. document not fully active).
 */
class FakeLockManager {
    grantGate: Promise<void> = Promise.resolve();
    rejectNextRequestWith: Error | undefined;

    private readonly held = new Set<string>();

    async request<T>(name: string, callback: () => T | PromiseLike<T>): Promise<T> {
        await this.grantGate;
        if (this.rejectNextRequestWith) {
            const error = this.rejectNextRequestWith;
            this.rejectNextRequestWith = undefined;
            throw error;
        }
        this.held.add(name);
        try {
            return await callback();
        } finally {
            this.held.delete(name);
        }
    }

    async query(): Promise<{ held: Array<{ name: string }> }> {
        return { held: [...this.held].map(name => ({ name })) };
    }
}

/** Lets a promise chain fire-and-forgotten by the code under test, e.g. its cleanup, run to completion. */
function flushMicrotasks(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}

describe('FrontendPluginPathService', () => {

    let fileService: FakeFileService;
    let service: FrontendPluginPathService;

    /** A service backed by the same {@link fileService}, standing for another browser tab. */
    function createService(): FrontendPluginPathService {
        const container = new Container();
        container.bind(FrontendPluginPathService).toSelf().inSingletonScope();
        container.bind(ILogger).to(MockLogger);
        container.bind(FileService).toConstantValue(fileService as any);
        container.bind(WorkspaceFileService).toSelf().inSingletonScope();
        container.bind(UntitledWorkspaceService).toSelf().inSingletonScope();
        container.bind(EnvVariablesServer).toConstantValue({
            getConfigDirUri: async () => 'file:///.theia'
        } as EnvVariablesServer);
        return container.get(FrontendPluginPathService);
    }

    /** A fake session folder name for the `session`th day of December 2025, e.g. `20251203T000000-...`. */
    function sessionFolderName(session: number): string {
        const day = String(session).padStart(2, '0');
        return `202512${day}T000000-00000000-0000-4000-8000-${day.padStart(12, '0')}`;
    }

    function sessionFolderUri(session: number): URI {
        return new URI(`file:///.theia/logs/${sessionFolderName(session)}/host`);
    }

    beforeEach(() => {
        fileService = new FakeFileService();
        service = createService();
    });

    describe('host log path', () => {

        it('gives every session a log folder of its own', async () => {
            const logPath = await service.getHostLogPath();

            expect(logPath).to.match(/^\/\.theia\/logs\/\d{8}T\d{6}-[0-9a-f-]{36}\/host$/);
            expect(fileService.directories).to.include(logPath);
        });

        it('resolves the log path only once per session', async () => {
            expect(await service.getHostLogPath()).to.equal(await service.getHostLogPath());
        });

        it('gives two tabs opened at the exact same moment distinct log folders', async () => {
            // freeze the clock so both instances below generate the exact same timestamp, as two tabs
            // opened together, e.g. by duplicating a tab or restoring a session, plausibly would
            const clock = sinon.useFakeTimers();
            try {
                // each tab runs its own instance of this service, unlike the backend's single shared one
                const other = createService();

                const [oneLogPath, otherLogPath] = await Promise.all([service.getHostLogPath(), other.getHostLogPath()]);

                expect(oneLogPath).to.not.equal(otherLogPath);
            } finally {
                clock.restore();
            }
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

        it('does not prune the log folder of a tab that is still open, even where count alone would', async () => {
            for (let session = 1; session <= 10; session++) {
                await fileService.createFolder(sessionFolderUri(session));
            }
            const locks = new FakeLockManager();
            const restore = installFakeLockManager(locks);
            try {
                // day 1 is the oldest of the ten, so by count alone it is the one due for pruning below -
                // except its tab, unlike the other nine, is still open, e.g. a tab pinned since day 1
                locks.request(`${SESSION_LOCK_PREFIX}${sessionFolderName(1)}`, () => new Promise(() => { /* never settles: tab still open */ }));

                await service.getHostLogPath();
                await flushMicrotasks();

                expect(sessionFolders()).to.include(`/.theia/logs/${sessionFolderName(1)}`);
            } finally {
                restore();
            }
        });

        it('does not create the session folder before its lifetime lock is actually granted', async () => {
            const locks = new FakeLockManager();
            const restore = installFakeLockManager(locks);
            try {
                const gate = new Deferred<void>();
                locks.grantGate = gate.promise;

                const logPathPromise = service.getHostLogPath();
                await flushMicrotasks();

                // the lock has been requested but not yet granted: another tab's cleanup, listing the
                // logs directory and querying locks in this exact window, must not find a folder here
                // whose lock query() does not yet show as held
                expect(fileService.directories).to.be.empty;
                expect((await locks.query()).held).to.be.empty;

                gate.resolve();
                const logPath = await logPathPromise;

                expect(fileService.directories).to.include(logPath);
                expect((await locks.query()).held).to.have.lengthOf(1);
            } finally {
                restore();
            }
        });

        it('does not hang plugin startup when its lifetime lock request is rejected', async () => {
            const locks = new FakeLockManager();
            // as the real API can reject without ever granting, e.g. when the document is not fully active
            locks.rejectNextRequestWith = new Error('document not fully active');
            const restore = installFakeLockManager(locks);
            try {
                const logPath = await service.getHostLogPath();

                expect(fileService.directories).to.include(logPath);
                expect((await locks.query()).held).to.be.empty;
            } finally {
                restore();
            }
        });

        it('never cleans up a folder that is not a session folder', async () => {
            for (let session = 1; session <= 12; session++) {
                await fileService.createFolder(sessionFolderUri(session));
            }
            await fileService.createFolder(new URI('file:///.theia/logs/not-a-session'));

            await service.getHostLogPath();

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
