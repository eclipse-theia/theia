// *****************************************************************************
// Copyright (C) 2026 EclipseSource GmbH.
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
// Guarded: another spec in the same mocha process may already have set it, and `set` throws on a
// second call.
try {
    FrontendApplicationConfigProvider.get();
} catch {
    FrontendApplicationConfigProvider.set({});
}

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Disposable, Emitter, ILogger, Logger, URI } from '@theia/core';
import { FileChangesEvent, FileChangeType, FileOperation, FileOperationEvent, FileStatWithMetadata } from '@theia/filesystem/lib/common/files';
import { DefaultAgentsMdService } from './agents-md-service';

disableJSDOM();

/** Long enough to outlast the service's 50ms coalescing window. */
const AFTER_DEBOUNCE_MS = 80;

describe('AgentsMdService', () => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let fileServiceMock: any;
    let workspaceServiceMock: any;
    let loggerErrorSpy: sinon.SinonStub;
    let fileChangesEmitter: Emitter<FileChangesEvent>;
    let operationsEmitter: Emitter<FileOperationEvent>;
    /* eslint-enable @typescript-eslint/no-explicit-any */

    function root(path: string): { resource: URI, name: string } {
        const resource = new URI(`file://${path}`);
        return { resource, name: resource.path.base };
    }

    /** Only `resource` is read by the service; the rest satisfies the event's signature. */
    function stat(path: string): FileStatWithMetadata {
        return { resource: new URI(`file://${path}`) } as FileStatWithMetadata;
    }

    function createService(): DefaultAgentsMdService {
        const service = new DefaultAgentsMdService();
        (service as unknown as { fileService: unknown }).fileService = fileServiceMock;
        (service as unknown as { workspaceService: unknown }).workspaceService = workspaceServiceMock;
        const loggerMock: ILogger = sinon.createStubInstance(Logger);
        loggerMock.error = loggerErrorSpy;
        (service as unknown as { logger: unknown }).logger = loggerMock;
        return service;
    }

    /** Runs the `@postConstruct` initialization and waits for the initial scan. */
    async function start(service: DefaultAgentsMdService): Promise<void> {
        (service as unknown as { init(): void }).init();
        await service.ready;
    }

    function existing(...paths: string[]): void {
        fileServiceMock.exists.callsFake((uri: URI) => Promise.resolve(paths.includes(uri.path.toString())));
    }

    beforeEach(() => {
        fileChangesEmitter = new Emitter<FileChangesEvent>();
        operationsEmitter = new Emitter<FileOperationEvent>();
        loggerErrorSpy = sinon.stub();
        fileServiceMock = {
            exists: sinon.stub().resolves(false),
            read: sinon.stub().resolves({ value: '' }),
            watch: sinon.stub().returns(Disposable.NULL),
            onDidFilesChange: (listener: (e: FileChangesEvent) => void) => fileChangesEmitter.event(listener),
            onDidRunOperation: (listener: (e: FileOperationEvent) => void) => operationsEmitter.event(listener)
        };
        workspaceServiceMock = {
            ready: Promise.resolve(),
            tryGetRoots: sinon.stub().returns([]),
            onWorkspaceChanged: sinon.stub().returns(Disposable.NULL)
        };
    });

    afterEach(() => {
        sinon.restore();
        fileChangesEmitter.dispose();
        operationsEmitter.dispose();
    });

    it('finds nothing without a workspace root', async () => {
        const service = createService();
        await start(service);

        expect(service.getAgentsMdFiles()).to.be.empty;
    });

    it('finds nothing when the root has no AGENTS.md', async () => {
        workspaceServiceMock.tryGetRoots.returns([root('/ws')]);
        const service = createService();
        await start(service);

        expect(service.getAgentsMdFiles()).to.be.empty;
    });

    it('discovers AGENTS.md at the workspace root', async () => {
        workspaceServiceMock.tryGetRoots.returns([root('/ws')]);
        existing('/ws/AGENTS.md');
        fileServiceMock.read.resolves({ value: '# Project' });
        const service = createService();
        await start(service);

        const files = service.getAgentsMdFiles();
        expect(files).to.have.lengthOf(1);
        expect(files[0].uri.path.toString()).to.equal('/ws/AGENTS.md');
        expect(files[0].content).to.equal('# Project');
        expect(files[0].rootName).to.equal('ws');
    });

    it('ignores a nested AGENTS.md, only the root is scanned', async () => {
        workspaceServiceMock.tryGetRoots.returns([root('/ws')]);
        existing('/ws/packages/core/AGENTS.md');
        const service = createService();
        await start(service);

        expect(service.getAgentsMdFiles()).to.be.empty;
    });

    it('reports one file per root, in workspace root order', async () => {
        workspaceServiceMock.tryGetRoots.returns([root('/a'), root('/b')]);
        existing('/a/AGENTS.md', '/b/AGENTS.md');
        fileServiceMock.read.callsFake((uri: URI) => Promise.resolve({ value: `content of ${uri.path.toString()}` }));
        const service = createService();
        await start(service);

        expect(service.getAgentsMdFiles().map(file => file.rootName)).to.deep.equal(['a', 'b']);
        expect(service.getAgentsMdFiles()[1].content).to.equal('content of /b/AGENTS.md');
    });

    it('keeps the other roots when one file cannot be read', async () => {
        workspaceServiceMock.tryGetRoots.returns([root('/broken'), root('/ok')]);
        existing('/broken/AGENTS.md', '/ok/AGENTS.md');
        fileServiceMock.read.callsFake((uri: URI) => uri.path.toString() === '/broken/AGENTS.md'
            ? Promise.reject(new Error('boom'))
            : Promise.resolve({ value: 'fine' }));
        const service = createService();
        await start(service);

        expect(service.getAgentsMdFiles().map(file => file.rootName)).to.deep.equal(['ok']);
        expect(loggerErrorSpy.called).to.be.true;
    });

    it('picks up an AGENTS.md created after the initial scan', async () => {
        workspaceServiceMock.tryGetRoots.returns([root('/ws')]);
        const service = createService();
        await start(service);
        expect(service.getAgentsMdFiles()).to.be.empty;

        existing('/ws/AGENTS.md');
        fileServiceMock.read.resolves({ value: 'added later' });
        const changed = new Promise<void>(resolve => service.onDidChange(() => resolve()));
        fileChangesEmitter.fire(new FileChangesEvent([{ resource: new URI('file:///ws/AGENTS.md'), type: FileChangeType.ADDED }]));

        await changed;
        expect(service.getAgentsMdFiles().map(file => file.content)).to.deep.equal(['added later']);
    });

    it('picks up an AGENTS.md written through the FileService before the watcher is live', async () => {
        // The migration writes AGENTS.md milliseconds after startup, while `FileService.watch` is
        // still registering its backend watcher, so no file change event is emitted for it.
        workspaceServiceMock.tryGetRoots.returns([root('/ws')]);
        const service = createService();
        await start(service);
        expect(service.getAgentsMdFiles()).to.be.empty;

        existing('/ws/AGENTS.md');
        fileServiceMock.read.resolves({ value: 'migrated' });
        const changed = new Promise<void>(resolve => service.onDidChange(() => resolve()));
        operationsEmitter.fire(new FileOperationEvent(new URI('file:///ws/AGENTS.md'), FileOperation.CREATE, stat('/ws/AGENTS.md')));

        await changed;
        expect(service.getAgentsMdFiles().map(file => file.content)).to.deep.equal(['migrated']);
    });

    it('picks up a file moved onto the AGENTS.md path, where only the move target matches', async () => {
        workspaceServiceMock.tryGetRoots.returns([root('/ws')]);
        const service = createService();
        await start(service);

        existing('/ws/AGENTS.md');
        fileServiceMock.read.resolves({ value: 'renamed into place' });
        const changed = new Promise<void>(resolve => service.onDidChange(() => resolve()));
        operationsEmitter.fire(new FileOperationEvent(new URI('file:///ws/NOTES.md'), FileOperation.MOVE, stat('/ws/AGENTS.md')));

        await changed;
        expect(service.getAgentsMdFiles().map(file => file.content)).to.deep.equal(['renamed into place']);
    });

    it('rescans when an AGENTS.md is written while the initial scan is still running', async () => {
        // Regression: `watchedFiles` used to be published only after a scan finished, so an
        // operation arriving mid-scan was dropped and the empty result stuck for the session.
        workspaceServiceMock.tryGetRoots.returns([root('/ws')]);
        const service = createService();
        let firstCheck = true;
        fileServiceMock.exists.callsFake(() => {
            if (firstCheck) {
                firstCheck = false;
                operationsEmitter.fire(new FileOperationEvent(new URI('file:///ws/AGENTS.md'), FileOperation.CREATE, stat('/ws/AGENTS.md')));
                return Promise.resolve(false);
            }
            return Promise.resolve(true);
        });
        fileServiceMock.read.resolves({ value: 'written during the scan' });

        await start(service);
        await new Promise(resolve => setTimeout(resolve, AFTER_DEBOUNCE_MS));

        expect(service.getAgentsMdFiles().map(file => file.content)).to.deep.equal(['written during the scan']);
    });

    it('ignores operations on other files in the root', async () => {
        workspaceServiceMock.tryGetRoots.returns([root('/ws')]);
        const service = createService();
        await start(service);
        const onDidChange = sinon.spy();
        service.onDidChange(onDidChange);

        operationsEmitter.fire(new FileOperationEvent(new URI('file:///ws/README.md'), FileOperation.CREATE, stat('/ws/README.md')));
        await new Promise(resolve => setTimeout(resolve, AFTER_DEBOUNCE_MS));

        expect(onDidChange.called).to.be.false;
    });

    it('ignores changes to other files in the root', async () => {
        workspaceServiceMock.tryGetRoots.returns([root('/ws')]);
        const service = createService();
        await start(service);
        const onDidChange = sinon.spy();
        service.onDidChange(onDidChange);

        fileChangesEmitter.fire(new FileChangesEvent([{ resource: new URI('file:///ws/README.md'), type: FileChangeType.UPDATED }]));
        await new Promise(resolve => setTimeout(resolve, AFTER_DEBOUNCE_MS));

        expect(onDidChange.called).to.be.false;
    });
});
