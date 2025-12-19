// *****************************************************************************
// Copyright (C) 2025 EclipseSource GmbH.
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
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { ChatSessionStoreImpl } from './chat-session-store-impl';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { PreferenceService } from '@theia/core/lib/common';
import { StorageService } from '@theia/core/lib/browser';
import { ILogger } from '@theia/core/lib/common/logger';
import { URI } from '@theia/core';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { ChatSessionIndex, ChatSessionMetadata } from '../common/chat-session-store';
import { PERSISTED_SESSION_LIMIT_PREF } from '../common/ai-chat-preferences';
import { ChatAgentLocation } from '../common/chat-agents';

disableJSDOM();

describe('ChatSessionStoreImpl', () => {
    let sandbox: sinon.SinonSandbox;
    let container: Container;
    let chatSessionStore: ChatSessionStoreImpl;
    let mockFileService: sinon.SinonStubbedInstance<FileService>;
    let mockPreferenceService: sinon.SinonStubbedInstance<PreferenceService>;
    let mockEnvServer: sinon.SinonStubbedInstance<EnvVariablesServer>;
    let deletedFiles: string[];

    const STORAGE_ROOT = 'file:///config/chatSessions';

    function createMockSessionMetadata(id: string, saveDate: number): ChatSessionMetadata {
        return {
            sessionId: id,
            title: `Session ${id}`,
            saveDate,
            location: ChatAgentLocation.Panel
        };
    }

    function createMockIndex(sessions: ChatSessionMetadata[]): ChatSessionIndex {
        const index: ChatSessionIndex = {};
        for (const session of sessions) {
            index[session.sessionId] = session;
        }
        return index;
    }

    before(() => {
        disableJSDOM = enableJSDOM();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        sandbox = sinon.createSandbox();
        deletedFiles = [];

        container = new Container();

        mockFileService = {
            readFile: sandbox.stub(),
            writeFile: sandbox.stub().resolves(),
            delete: sandbox.stub().callsFake(async (uri: URI) => {
                deletedFiles.push(uri.toString());
            }),
            createFolder: sandbox.stub().resolves()
        } as unknown as sinon.SinonStubbedInstance<FileService>;

        mockPreferenceService = {
            get: sandbox.stub()
        } as unknown as sinon.SinonStubbedInstance<PreferenceService>;

        mockEnvServer = {
            getConfigDirUri: sandbox.stub().resolves('file:///config')
        } as unknown as sinon.SinonStubbedInstance<EnvVariablesServer>;

        const mockWorkspaceService = {} as WorkspaceService;
        const mockStorageService = {} as StorageService;
        const mockLogger = {
            debug: sandbox.stub(),
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub()
        } as unknown as ILogger;

        container.bind(FileService).toConstantValue(mockFileService as unknown as FileService);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService as unknown as PreferenceService);
        container.bind(EnvVariablesServer).toConstantValue(mockEnvServer as unknown as EnvVariablesServer);
        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        container.bind(StorageService).toConstantValue(mockStorageService);
        container.bind('ChatSessionStore').toConstantValue(mockLogger);
        container.bind(ILogger).toConstantValue(mockLogger).whenTargetNamed('ChatSessionStore');

        container.bind(ChatSessionStoreImpl).toSelf().inSingletonScope();

        chatSessionStore = container.get(ChatSessionStoreImpl);
    });

    afterEach(() => {
        sandbox.restore();
    });

    describe('trimSessions', () => {
        describe('when persistedSessionLimit is -1 (unlimited)', () => {
            beforeEach(() => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(-1);
            });

            it('should not delete any sessions regardless of count', async () => {
                const sessions = [
                    createMockSessionMetadata('session-1', 1000),
                    createMockSessionMetadata('session-2', 2000),
                    createMockSessionMetadata('session-3', 3000),
                    createMockSessionMetadata('session-4', 4000),
                    createMockSessionMetadata('session-5', 5000)
                ];
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // Access protected method via any
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.be.empty;
                expect(mockFileService.delete.called).to.be.false;
            });

            it('should not delete sessions even with 100 sessions', async () => {
                const sessions = Array.from({ length: 100 }, (_, i) =>
                    createMockSessionMetadata(`session-${i}`, (i + 1) * 1000)
                );
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.be.empty;
            });
        });

        describe('when persistedSessionLimit is 0 (no persistence)', () => {
            beforeEach(() => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(0);
            });

            it('should delete all sessions and clear index', async () => {
                const sessions = [
                    createMockSessionMetadata('session-1', 1000),
                    createMockSessionMetadata('session-2', 2000),
                    createMockSessionMetadata('session-3', 3000)
                ];
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.have.lengthOf(3);
                expect(deletedFiles).to.include(`${STORAGE_ROOT}/session-1.json`);
                expect(deletedFiles).to.include(`${STORAGE_ROOT}/session-2.json`);
                expect(deletedFiles).to.include(`${STORAGE_ROOT}/session-3.json`);

                const savedIndexCall = mockFileService.writeFile.lastCall;
                expect(savedIndexCall).to.not.be.null;
                const savedIndex = JSON.parse(savedIndexCall.args[1].toString());
                expect(Object.keys(savedIndex)).to.have.lengthOf(0);
            });

            it('should handle empty index gracefully', async () => {
                const index: ChatSessionIndex = {};

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.be.empty;
            });
        });

        describe('when persistedSessionLimit is positive', () => {
            it('should not trim when session count is within limit', async () => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(5);

                const sessions = [
                    createMockSessionMetadata('session-1', 1000),
                    createMockSessionMetadata('session-2', 2000),
                    createMockSessionMetadata('session-3', 3000)
                ];
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.be.empty;
            });

            it('should trim oldest sessions when count exceeds limit', async () => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(3);

                const sessions = [
                    createMockSessionMetadata('session-1', 1000),
                    createMockSessionMetadata('session-2', 2000),
                    createMockSessionMetadata('session-3', 3000),
                    createMockSessionMetadata('session-4', 4000),
                    createMockSessionMetadata('session-5', 5000)
                ];
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.have.lengthOf(2);
                expect(deletedFiles).to.include(`${STORAGE_ROOT}/session-1.json`);
                expect(deletedFiles).to.include(`${STORAGE_ROOT}/session-2.json`);
                expect(deletedFiles).to.not.include(`${STORAGE_ROOT}/session-3.json`);
                expect(deletedFiles).to.not.include(`${STORAGE_ROOT}/session-4.json`);
                expect(deletedFiles).to.not.include(`${STORAGE_ROOT}/session-5.json`);
            });

            it('should delete sessions in order of saveDate (oldest first)', async () => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(2);

                const sessions = [
                    createMockSessionMetadata('session-newest', 5000),
                    createMockSessionMetadata('session-middle', 3000),
                    createMockSessionMetadata('session-oldest', 1000),
                    createMockSessionMetadata('session-second-oldest', 2000)
                ];
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.have.lengthOf(2);
                expect(deletedFiles).to.include(`${STORAGE_ROOT}/session-oldest.json`);
                expect(deletedFiles).to.include(`${STORAGE_ROOT}/session-second-oldest.json`);
                expect(deletedFiles).to.not.include(`${STORAGE_ROOT}/session-newest.json`);
                expect(deletedFiles).to.not.include(`${STORAGE_ROOT}/session-middle.json`);
            });

            it('should update index after trimming', async () => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(2);

                const sessions = [
                    createMockSessionMetadata('session-1', 1000),
                    createMockSessionMetadata('session-2', 2000),
                    createMockSessionMetadata('session-3', 3000),
                    createMockSessionMetadata('session-4', 4000)
                ];
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                const savedIndexCall = mockFileService.writeFile.lastCall;
                expect(savedIndexCall).to.not.be.null;

                const savedIndex = JSON.parse(savedIndexCall.args[1].toString());
                expect(Object.keys(savedIndex)).to.have.lengthOf(2);
                expect(savedIndex['session-3']).to.not.be.undefined;
                expect(savedIndex['session-4']).to.not.be.undefined;
                expect(savedIndex['session-1']).to.be.undefined;
                expect(savedIndex['session-2']).to.be.undefined;
            });

            it('should trim to exactly the limit (42 session bug scenario)', async () => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(25);

                const sessions = Array.from({ length: 42 }, (_, i) =>
                    createMockSessionMetadata(`session-${i}`, (i + 1) * 1000)
                );
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.have.lengthOf(17);

                for (let i = 0; i < 17; i++) {
                    expect(deletedFiles).to.include(`${STORAGE_ROOT}/session-${i}.json`);
                }

                for (let i = 17; i < 42; i++) {
                    expect(deletedFiles).to.not.include(`${STORAGE_ROOT}/session-${i}.json`);
                }
            });
        });

        describe('edge cases', () => {
            it('should handle empty session index', async () => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(5);

                const index: ChatSessionIndex = {};

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.be.empty;
            });

            it('should handle sessions exactly at limit', async () => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(3);

                const sessions = [
                    createMockSessionMetadata('session-1', 1000),
                    createMockSessionMetadata('session-2', 2000),
                    createMockSessionMetadata('session-3', 3000)
                ];
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.be.empty;
            });

            it('should handle limit of 1', async () => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(1);

                const sessions = [
                    createMockSessionMetadata('session-1', 1000),
                    createMockSessionMetadata('session-2', 2000),
                    createMockSessionMetadata('session-3', 3000)
                ];
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.have.lengthOf(2);
                expect(deletedFiles).to.include(`${STORAGE_ROOT}/session-1.json`);
                expect(deletedFiles).to.include(`${STORAGE_ROOT}/session-2.json`);
                expect(deletedFiles).to.not.include(`${STORAGE_ROOT}/session-3.json`);
            });

            it('should handle file deletion errors gracefully', async () => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(2);

                const sessions = [
                    createMockSessionMetadata('session-1', 1000),
                    createMockSessionMetadata('session-2', 2000),
                    createMockSessionMetadata('session-3', 3000)
                ];
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                mockFileService.delete.rejects(new Error('File not found'));

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                const savedIndexCall = mockFileService.writeFile.lastCall;
                const savedIndex = JSON.parse(savedIndexCall.args[1].toString());
                expect(Object.keys(savedIndex)).to.have.lengthOf(2);
            });

            it('should handle sessions with equal save dates', async () => {
                mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(2);

                const sessions = [
                    createMockSessionMetadata('session-a', 1000),
                    createMockSessionMetadata('session-b', 1000),
                    createMockSessionMetadata('session-c', 2000),
                    createMockSessionMetadata('session-d', 2000)
                ];
                const index = createMockIndex(sessions);

                mockFileService.readFile.resolves({
                    value: BinaryBuffer.fromString(JSON.stringify(index))
                } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).trimSessions();

                expect(deletedFiles).to.have.lengthOf(2);

                const savedIndexCall = mockFileService.writeFile.lastCall;
                const savedIndex = JSON.parse(savedIndexCall.args[1].toString());
                expect(Object.keys(savedIndex)).to.have.lengthOf(2);
            });
        });
    });

    describe('getPersistedSessionLimit', () => {
        it('should return -1 for unlimited sessions', () => {
            mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(-1);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = (chatSessionStore as any).getPersistedSessionLimit();

            expect(result).to.equal(-1);
        });

        it('should return 0 for no persistence', () => {
            mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(0);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = (chatSessionStore as any).getPersistedSessionLimit();

            expect(result).to.equal(0);
        });

        it('should return default value of 25', () => {
            mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(25);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = (chatSessionStore as any).getPersistedSessionLimit();

            expect(result).to.equal(25);
        });

        it('should return custom positive value', () => {
            mockPreferenceService.get.withArgs(PERSISTED_SESSION_LIMIT_PREF, 25).returns(100);

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = (chatSessionStore as any).getPersistedSessionLimit();

            expect(result).to.equal(100);
        });
    });
});
