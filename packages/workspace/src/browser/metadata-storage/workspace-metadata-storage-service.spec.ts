/********************************************************************************
 * Copyright (C) 2026 EclipseSource and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
 ********************************************************************************/

import { enableJSDOM } from '@theia/core/lib/browser/test/jsdom';
let disableJSDOM = enableJSDOM();

import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
FrontendApplicationConfigProvider.set({});

import { Container } from '@theia/core/shared/inversify';
import { expect } from 'chai';
import * as sinon from 'sinon';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { ILogger } from '@theia/core/lib/common/logger';
import { URI } from '@theia/core/lib/common/uri';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { FileContent, FileStat, FileStatWithMetadata } from '@theia/filesystem/lib/common/files';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '../workspace-service';
import { WorkspaceMetadataStorageServiceImpl, WorkspaceMetadataStoreFactory } from './workspace-metadata-storage-service';
import { WorkspaceMetadataStoreImpl } from './workspace-metadata-store';
import * as uuid from '@theia/core/lib/common/uuid';

disableJSDOM();

before(() => disableJSDOM = enableJSDOM());
after(() => disableJSDOM());

describe('WorkspaceMetadataStorageService', () => {
    let service: WorkspaceMetadataStorageServiceImpl;
    let fileService: sinon.SinonStubbedInstance<FileService>;
    let workspaceService: WorkspaceService;
    let envVariableServer: sinon.SinonStubbedInstance<EnvVariablesServer>;
    let logger: sinon.SinonStubbedInstance<ILogger>;
    let container: Container;
    let generateUuidStub: sinon.SinonStub;

    const configDir = '/home/user/.theia';
    const workspaceRootPath = '/home/user/my-workspace';
    const workspaceRootUri = new URI(`file://${workspaceRootPath}`);

    beforeEach(() => {
        // Create container for DI
        container = new Container();

        // Create mocks
        fileService = {
            exists: sinon.stub(),
            readFile: sinon.stub(),
            writeFile: sinon.stub(),
            createFolder: sinon.stub(),
            delete: sinon.stub(),
        } as sinon.SinonStubbedInstance<FileService>;

        // Create workspace service with stubs
        workspaceService = new WorkspaceService();
        sinon.stub(workspaceService, 'tryGetRoots').returns([{
            resource: workspaceRootUri,
            isDirectory: true
        } as FileStat]);

        envVariableServer = {
            getConfigDirUri: sinon.stub().resolves(`file://${configDir}`)
        } as unknown as sinon.SinonStubbedInstance<EnvVariablesServer>;

        logger = {
            debug: sinon.stub(),
            info: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub(),
        } as unknown as sinon.SinonStubbedInstance<ILogger>;

        // Bind to container
        container.bind(FileService).toConstantValue(fileService as unknown as FileService);
        container.bind(WorkspaceService).toConstantValue(workspaceService);
        container.bind(EnvVariablesServer).toConstantValue(envVariableServer as unknown as EnvVariablesServer);
        container.bind(ILogger).toConstantValue(logger as unknown as ILogger).whenTargetNamed('WorkspaceMetadataStorage');
        container.bind(WorkspaceMetadataStoreImpl).toSelf();
        container.bind(WorkspaceMetadataStoreFactory).toFactory(ctx => () => ctx.container.get(WorkspaceMetadataStoreImpl));
        container.bind(WorkspaceMetadataStorageServiceImpl).toSelf();

        service = container.get(WorkspaceMetadataStorageServiceImpl);

        // Stub UUID generation
        generateUuidStub = sinon.stub(uuid, 'generateUuid');

        // Default file service behavior
        fileService.exists.resolves(false);
        fileService.createFolder.resolves({
            resource: new URI('file:///dummy'),
            isFile: false,
            isDirectory: true,
            isSymbolicLink: false,
            mtime: Date.now(),
            ctime: Date.now(),
            etag: 'dummy',
            size: 0
        } as FileStatWithMetadata);
        fileService.writeFile.resolves({
            resource: new URI('file:///dummy'),
            isFile: true,
            isDirectory: false,
            isSymbolicLink: false,
            mtime: Date.now(),
            ctime: Date.now(),
            etag: 'dummy',
            size: 0
        } as FileStatWithMetadata);
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getOrCreateStore', () => {
        it('should create a new store with a unique key', async () => {
            const testUuid = 'test-uuid-1234';
            generateUuidStub.returns(testUuid);

            const store = await service.getOrCreateStore('my-feature');

            expect(store).to.exist;
            expect(store.key).to.equal('my-feature');
            expect(store.location.toString()).to.equal(`file://${configDir}/workspace-metadata/${testUuid}/my-feature`);
        });

        it('should return existing store if key already exists', async () => {
            const testUuid = 'test-uuid-1234';
            generateUuidStub.returns(testUuid);

            const store1 = await service.getOrCreateStore('my-feature');
            const store2 = await service.getOrCreateStore('my-feature');

            expect(store1).to.equal(store2);
        });

        it('should throw error if no workspace is open', async () => {
            (workspaceService.tryGetRoots as sinon.SinonStub).returns([]);

            try {
                await service.getOrCreateStore('my-feature');
                expect.fail('Should have thrown error for no workspace');
            } catch (error) {
                expect(error.message).to.contain('no workspace is currently open');
            }
        });

        it('should mangle keys with special characters', async () => {
            const testUuid = 'test-uuid-1234';
            generateUuidStub.returns(testUuid);

            const store = await service.getOrCreateStore('my/feature.name');

            expect(store.key).to.equal('my-feature-name');
            expect(store.location.toString()).to.equal(`file://${configDir}/workspace-metadata/${testUuid}/my-feature-name`);
        });

        it('should generate and store UUID for new workspace', async () => {
            const testUuid = 'test-uuid-1234';
            generateUuidStub.returns(testUuid);

            await service.getOrCreateStore('my-feature');

            // Check that writeFile was called to save the index
            expect(fileService.writeFile.calledOnce).to.be.true;
            const writeCall = fileService.writeFile.getCall(0);
            const indexUri = writeCall.args[0] as URI;
            const content = (writeCall.args[1] as BinaryBuffer).toString();

            expect(indexUri.toString()).to.equal(`file://${configDir}/workspace-metadata/index.json`);

            const index = JSON.parse(content);
            expect(index[workspaceRootPath]).to.equal(testUuid);
        });

        it('should reuse existing UUID for known workspace', async () => {
            const existingUuid = 'existing-uuid-5678';
            const indexContent = JSON.stringify({
                [workspaceRootPath]: existingUuid
            });

            fileService.exists.resolves(true);
            fileService.readFile.resolves({
                resource: new URI(`file://${configDir}/workspace-metadata/index.json`),
                value: BinaryBuffer.fromString(indexContent)
            } as FileContent);

            const store = await service.getOrCreateStore('my-feature');

            expect(store.location.toString()).to.equal(`file://${configDir}/workspace-metadata/${existingUuid}/my-feature`);
            // Should not write index again since UUID already existed
            expect(fileService.writeFile.called).to.be.false;
        });

        it('should handle multiple stores with different keys', async () => {
            generateUuidStub.returns('test-uuid-1234');

            const store1 = await service.getOrCreateStore('feature-1');
            const store2 = await service.getOrCreateStore('feature-2');

            expect(store1.key).to.equal('feature-1');
            expect(store2.key).to.equal('feature-2');
            expect(store1.location.toString()).to.not.equal(store2.location.toString());
        });

        it('should allow recreating store with same key after disposal', async () => {
            generateUuidStub.returns('test-uuid-1234');

            const store1 = await service.getOrCreateStore('my-feature');
            expect(store1.key).to.equal('my-feature');

            store1.dispose();

            // Should not throw - the key should be available again
            const store2 = await service.getOrCreateStore('my-feature');
            expect(store2.key).to.equal('my-feature');
            expect(store2).to.not.equal(store1);
        });
    });

    describe('key mangling', () => {
        beforeEach(() => {
            generateUuidStub.returns('test-uuid');
        });

        it('should replace forward slashes with hyphens', async () => {
            const store = await service.getOrCreateStore('path/to/feature');
            expect(store.key).to.equal('path-to-feature');
        });

        it('should replace dots with hyphens', async () => {
            const store = await service.getOrCreateStore('my.feature.name');
            expect(store.key).to.equal('my-feature-name');
        });

        it('should replace spaces with hyphens', async () => {
            const store = await service.getOrCreateStore('my feature name');
            expect(store.key).to.equal('my-feature-name');
        });

        it('should preserve alphanumeric characters, hyphens, and underscores', async () => {
            const store = await service.getOrCreateStore('My_Feature-123');
            expect(store.key).to.equal('My_Feature-123');
        });

        it('should replace multiple special characters', async () => {
            const store = await service.getOrCreateStore('!@#$%^&*()');
            expect(store.key).to.equal('----------');
        });
    });

    describe('index management', () => {
        it('should handle missing index file', async () => {
            generateUuidStub.returns('new-uuid');
            fileService.exists.resolves(false);

            const store = await service.getOrCreateStore('feature');

            expect(store).to.exist;
            expect(fileService.writeFile.calledOnce).to.be.true;
        });

        it('should handle corrupted index file', async () => {
            generateUuidStub.returns('new-uuid');
            fileService.exists.resolves(true);
            fileService.readFile.resolves({
                resource: new URI(`file://${configDir}/workspace-metadata/index.json`),
                value: BinaryBuffer.fromString('{ invalid json')
            } as FileContent);

            const store = await service.getOrCreateStore('feature');

            expect(store).to.exist;
            expect(logger.warn.calledOnce).to.be.true;
        });

        it('should create metadata root directory when saving index', async () => {
            generateUuidStub.returns('test-uuid');

            await service.getOrCreateStore('feature');

            expect(fileService.createFolder.calledOnce).to.be.true;
            const createCall = fileService.createFolder.getCall(0);
            const createdUri = createCall.args[0] as URI;
            expect(createdUri.toString()).to.equal(`file://${configDir}/workspace-metadata`);
        });
    });

    describe('workspace changes', () => {
        it('should update store location when workspace root changes', async () => {
            const uuid1 = 'workspace-1-uuid';
            const uuid2 = 'workspace-2-uuid';
            let uuidCallCount = 0;
            generateUuidStub.callsFake(() => {
                uuidCallCount++;
                return uuidCallCount === 1 ? uuid1 : uuid2;
            });

            const store = await service.getOrCreateStore('feature');
            const initialLocation = store.location.toString();

            // Simulate workspace change
            const newWorkspaceRoot = new URI('file:///home/user/other-workspace');
            (workspaceService.tryGetRoots as sinon.SinonStub).returns([{
                resource: newWorkspaceRoot,
                isDirectory: true
            } as FileStat]);

            // Track location changes
            let locationChanged = false;
            let newLocation: URI | undefined;
            store.onDidChangeLocation(uri => {
                locationChanged = true;
                newLocation = uri;
            });

            // Trigger workspace change via the protected emitter
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (workspaceService as any)['onWorkspaceChangeEmitter'].fire([]);

            // Wait for async updates
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(locationChanged).to.be.true;
            expect(newLocation?.toString()).to.not.equal(initialLocation);
            expect(newLocation?.toString()).to.contain(uuid2);
        });
    });
});
