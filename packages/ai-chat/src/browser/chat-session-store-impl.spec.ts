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
import { SessionStorageDefaultsProvider } from './session-storage-defaults-provider';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { PreferenceService } from '@theia/core/lib/common';
import { StorageService } from '@theia/core/lib/browser';
import { ILogger } from '@theia/core/lib/common/logger';
import { URI } from '@theia/core';
import { BinaryBuffer } from '@theia/core/lib/common/buffer';
import { ChatSessionIndex, ChatSessionMetadata } from '../common/chat-session-store';
import {
    PERSISTED_SESSION_LIMIT_PREF,
    SESSION_STORAGE_PREF,
    SessionStorageValue
} from '../common/ai-chat-preferences';
import { ChatAgentLocation } from '../common/chat-agents';
import { FileStat } from '@theia/filesystem/lib/common/files';

disableJSDOM();

describe('ChatSessionStoreImpl', () => {
    let sandbox: sinon.SinonSandbox;
    let container: Container;
    let chatSessionStore: ChatSessionStoreImpl;
    let mockFileService: sinon.SinonStubbedInstance<FileService>;
    let mockPreferenceService: sinon.SinonStubbedInstance<PreferenceService>;
    let mockEnvServer: sinon.SinonStubbedInstance<EnvVariablesServer>;
    let mockWorkspaceService: {
        roots: Promise<FileStat[]>;
        onWorkspaceLocationChanged: sinon.SinonStub;
    };
    let deletedFiles: string[];
    let preferenceChangeCallback: ((event: { preferenceName: string }) => void) | undefined;
    let workspaceLocationChangeCallback: (() => void) | undefined;

    // Use obviously fake paths that will not exist on real systems to prevent any accidental
    // interaction with actual user data if mocking were to misconfigured
    const STORAGE_ROOT = 'file:///__test__/mock-config/chatSessions';
    const WORKSPACE_ROOT = 'file:///__test__/mock-workspace/my-project';
    const GLOBAL_CONFIG_DIR = 'file:///__test__/mock-config';
    const DEFAULT_GLOBAL_PATH = '/__test__/mock-config/chatSessions';
    const CUSTOM_GLOBAL_PATH = '/__test__/mock-custom-global/path';

    // Default storage value with dynamic global path (mimicking AIChatPreferenceContribution)
    const DEFAULT_STORAGE_VALUE: SessionStorageValue = {
        scope: 'workspace',
        workspacePath: '.theia/chatSessions',
        globalPath: DEFAULT_GLOBAL_PATH
    };

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
        preferenceChangeCallback = undefined;
        workspaceLocationChangeCallback = undefined;

        container = new Container();

        mockFileService = {
            readFile: sandbox.stub(),
            writeFile: sandbox.stub().resolves(),
            delete: sandbox.stub().callsFake(async (uri: URI) => {
                deletedFiles.push(uri.toString());
            }),
            createFolder: sandbox.stub().resolves(),
            exists: sandbox.stub().resolves(true),
            copy: sandbox.stub().resolves(),
            resolve: sandbox.stub().resolves({ children: [] })
        } as unknown as sinon.SinonStubbedInstance<FileService>;

        mockPreferenceService = {
            ready: Promise.resolve(),
            get: sandbox.stub(),
            onPreferenceChanged: sandbox.stub().callsFake((callback: (event: { preferenceName: string }) => void) => {
                preferenceChangeCallback = callback;
                return { dispose: () => { preferenceChangeCallback = undefined; } };
            })
        } as unknown as sinon.SinonStubbedInstance<PreferenceService>;

        mockEnvServer = {
            getConfigDirUri: sandbox.stub().resolves(GLOBAL_CONFIG_DIR)
        } as unknown as sinon.SinonStubbedInstance<EnvVariablesServer>;

        mockWorkspaceService = {
            roots: Promise.resolve([]),
            onWorkspaceLocationChanged: sandbox.stub().callsFake((callback: () => void) => {
                workspaceLocationChangeCallback = callback;
                return { dispose: () => { workspaceLocationChangeCallback = undefined; } };
            })
        };
        const mockStorageService = {} as StorageService;
        const mockLogger = {
            debug: sandbox.stub(),
            info: sandbox.stub(),
            warn: sandbox.stub(),
            error: sandbox.stub()
        } as unknown as ILogger;

        // Create a mock for SessionStorageDefaultsProvider that returns the test defaults
        const mockDefaultsProvider = {
            initialize: sandbox.stub().resolves(),
            getDefaultWorkspacePath: sandbox.stub().returns('.theia/chatSessions'),
            getDefaultGlobalPath: sandbox.stub().returns(DEFAULT_GLOBAL_PATH),
            getDefaultValue: sandbox.stub().returns(DEFAULT_STORAGE_VALUE),
            mergeWithDefaults: sandbox.stub().callsFake((partial: Partial<SessionStorageValue> | undefined) => ({
                scope: partial?.scope ?? 'workspace',
                workspacePath: partial?.workspacePath ?? '.theia/chatSessions',
                globalPath: partial?.globalPath ?? DEFAULT_GLOBAL_PATH
            }))
        };

        container.bind(FileService).toConstantValue(mockFileService as unknown as FileService);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService as unknown as PreferenceService);
        container.bind(EnvVariablesServer).toConstantValue(mockEnvServer as unknown as EnvVariablesServer);
        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService as unknown as WorkspaceService);
        container.bind(StorageService).toConstantValue(mockStorageService);
        container.bind(SessionStorageDefaultsProvider).toConstantValue(mockDefaultsProvider as unknown as SessionStorageDefaultsProvider);
        container.bind('ChatSessionStore').toConstantValue(mockLogger);
        container.bind(ILogger).toConstantValue(mockLogger).whenTargetNamed('ChatSessionStore');

        container.bind(ChatSessionStoreImpl).toSelf().inSingletonScope();

        chatSessionStore = container.get(ChatSessionStoreImpl);

        // Set up default storage preferences for all tests (using dynamic default that mimics AIChatPreferenceContribution)
        mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns(DEFAULT_STORAGE_VALUE);
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

    describe('resolveStorageRoot', () => {
        describe('when scope is workspace', () => {
            it('should use workspace storage path when workspace is open', async () => {
                mockWorkspaceService.roots = Promise.resolve([
                    { resource: new URI(WORKSPACE_ROOT), isDirectory: true } as FileStat
                ]);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (chatSessionStore as any).resolveStorageRoot();

                expect(result.toString()).to.equal(`${WORKSPACE_ROOT}/.theia/chatSessions`);
            });

            it('should use custom workspace path when configured', async () => {
                mockWorkspaceService.roots = Promise.resolve([
                    { resource: new URI(WORKSPACE_ROOT), isDirectory: true } as FileStat
                ]);
                mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns({
                    ...DEFAULT_STORAGE_VALUE,
                    workspacePath: 'custom/chat-storage'
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (chatSessionStore as any).resolveStorageRoot();

                expect(result.toString()).to.equal(`${WORKSPACE_ROOT}/custom/chat-storage`);
            });

            it('should fall back to global storage when no workspace is open', async () => {
                mockWorkspaceService.roots = Promise.resolve([]);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (chatSessionStore as any).resolveStorageRoot();

                expect(result.toString()).to.equal(`${GLOBAL_CONFIG_DIR}/chatSessions`);
            });
        });

        describe('when scope is global', () => {
            beforeEach(() => {
                mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns({
                    ...DEFAULT_STORAGE_VALUE,
                    scope: 'global'
                });
            });

            it('should use default global storage path when preference is empty', async () => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (chatSessionStore as any).resolveStorageRoot();

                expect(result.toString()).to.equal(`${GLOBAL_CONFIG_DIR}/chatSessions`);
            });

            it('should use custom absolute global path when configured', async () => {
                mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns({
                    ...DEFAULT_STORAGE_VALUE,
                    scope: 'global',
                    globalPath: CUSTOM_GLOBAL_PATH
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (chatSessionStore as any).resolveStorageRoot();

                // Custom path is treated as absolute
                expect(result.toString()).to.equal(`file://${CUSTOM_GLOBAL_PATH}`);
            });

            it('should ignore workspace even when open', async () => {
                mockWorkspaceService.roots = Promise.resolve([
                    { resource: new URI(WORKSPACE_ROOT), isDirectory: true } as FileStat
                ]);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const result = await (chatSessionStore as any).resolveStorageRoot();

                expect(result.toString()).to.equal(`${GLOBAL_CONFIG_DIR}/chatSessions`);
            });
        });
    });

    describe('cache invalidation', () => {
        it('should invalidate cache when storage preference changes scope', async () => {
            mockWorkspaceService.roots = Promise.resolve([
                { resource: new URI(WORKSPACE_ROOT), isDirectory: true } as FileStat
            ]);

            // First call to establish cache
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const firstResult = await (chatSessionStore as any).getStorageRoot();
            expect(firstResult.toString()).to.equal(`${WORKSPACE_ROOT}/.theia/chatSessions`);

            // Change scope to global
            mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns({
                ...DEFAULT_STORAGE_VALUE,
                scope: 'global'
            });

            // Trigger preference change
            expect(preferenceChangeCallback).to.not.be.undefined;
            preferenceChangeCallback!({ preferenceName: SESSION_STORAGE_PREF });

            // Next call should resolve new path
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const secondResult = await (chatSessionStore as any).getStorageRoot();
            expect(secondResult.toString()).to.equal(`${GLOBAL_CONFIG_DIR}/chatSessions`);
        });

        it('should invalidate cache when workspace path preference changes', async () => {
            mockWorkspaceService.roots = Promise.resolve([
                { resource: new URI(WORKSPACE_ROOT), isDirectory: true } as FileStat
            ]);

            // First call to establish cache
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const firstResult = await (chatSessionStore as any).getStorageRoot();
            expect(firstResult.toString()).to.equal(`${WORKSPACE_ROOT}/.theia/chatSessions`);

            // Change workspace path
            mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns({
                ...DEFAULT_STORAGE_VALUE,
                workspacePath: 'new/path'
            });

            // Trigger preference change
            expect(preferenceChangeCallback).to.not.be.undefined;
            preferenceChangeCallback!({ preferenceName: SESSION_STORAGE_PREF });

            // Next call should resolve new path
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const secondResult = await (chatSessionStore as any).getStorageRoot();
            expect(secondResult.toString()).to.equal(`${WORKSPACE_ROOT}/new/path`);
        });

        it('should invalidate cache when global path preference changes', async () => {
            mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns({
                ...DEFAULT_STORAGE_VALUE,
                scope: 'global'
            });

            // First call to establish cache
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const firstResult = await (chatSessionStore as any).getStorageRoot();
            expect(firstResult.toString()).to.equal(`${GLOBAL_CONFIG_DIR}/chatSessions`);

            // Change global path (absolute path)
            mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns({
                ...DEFAULT_STORAGE_VALUE,
                scope: 'global',
                globalPath: CUSTOM_GLOBAL_PATH
            });

            // Trigger preference change
            expect(preferenceChangeCallback).to.not.be.undefined;
            preferenceChangeCallback!({ preferenceName: SESSION_STORAGE_PREF });

            // Next call should resolve new absolute path
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const secondResult = await (chatSessionStore as any).getStorageRoot();
            expect(secondResult.toString()).to.equal(`file://${CUSTOM_GLOBAL_PATH}`);
        });

        it('should invalidate cache when workspace location changes', async () => {
            mockWorkspaceService.roots = Promise.resolve([
                { resource: new URI(WORKSPACE_ROOT), isDirectory: true } as FileStat
            ]);

            // First call to establish cache
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const firstResult = await (chatSessionStore as any).getStorageRoot();
            expect(firstResult.toString()).to.equal(`${WORKSPACE_ROOT}/.theia/chatSessions`);

            // Change workspace
            const newWorkspaceRoot = 'file:///workspace/other-project';
            mockWorkspaceService.roots = Promise.resolve([
                { resource: new URI(newWorkspaceRoot), isDirectory: true } as FileStat
            ]);

            // Trigger workspace location change
            expect(workspaceLocationChangeCallback).to.not.be.undefined;
            workspaceLocationChangeCallback!();

            // Next call should resolve new path
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const secondResult = await (chatSessionStore as any).getStorageRoot();
            expect(secondResult.toString()).to.equal(`${newWorkspaceRoot}/.theia/chatSessions`);
        });

        it('should invalidate index cache along with storage root', async () => {
            mockWorkspaceService.roots = Promise.resolve([
                { resource: new URI(WORKSPACE_ROOT), isDirectory: true } as FileStat
            ]);

            // Setup index file response
            const index = { 'session-1': { sessionId: 'session-1', title: 'Test', saveDate: 1000, location: 'panel' } };
            mockFileService.readFile.resolves({
                value: BinaryBuffer.fromString(JSON.stringify(index))
            } as never);

            // Load index (establishes cache)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (chatSessionStore as any).loadIndex();

            // Change scope to trigger invalidation
            mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns({
                ...DEFAULT_STORAGE_VALUE,
                scope: 'global'
            });
            preferenceChangeCallback!({ preferenceName: SESSION_STORAGE_PREF });

            // Load index again - should read from file again
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (chatSessionStore as any).loadIndex();

            // readFile should have been called twice
            expect(mockFileService.readFile.callCount).to.equal(2);
        });
    });

    describe('workspace storage seeding', () => {
        let copiedFiles: Array<{ source: string; target: string }>;

        let seedFromGlobalStorageSpy: sinon.SinonSpy;

        beforeEach(() => {
            copiedFiles = [];

            // Reset call history but keep default behavior
            mockFileService.exists.resetHistory();
            mockFileService.copy.resetHistory();
            mockFileService.resolve.resetHistory();

            // Configure copy to track copied files
            mockFileService.copy.resetBehavior();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            mockFileService.copy.callsFake(async (source: URI, target: URI): Promise<any> => {
                copiedFiles.push({ source: source.toString(), target: target.toString() });
            });

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            seedFromGlobalStorageSpy = sandbox.spy(chatSessionStore as any, 'seedFromGlobalStorage');
        });

        describe('seedFromGlobalStorage', () => {
            it('should copy all JSON files from global storage to workspace storage', async () => {
                const workspaceRoot = new URI(`${WORKSPACE_ROOT}/.theia/chatSessions`);
                const globalRoot = new URI(`${GLOBAL_CONFIG_DIR}/chatSessions`);

                mockFileService.exists
                    .withArgs(sinon.match((uri: URI) => uri.toString().includes('index.json') && uri.toString().includes('mock-config')))
                    .resolves(true);

                mockFileService.resolve
                    .withArgs(sinon.match((uri: URI) => uri.toString() === globalRoot.toString()))
                    .resolves({
                        children: [
                            { name: 'index.json', resource: globalRoot.resolve('index.json') },
                            { name: 'session-1.json', resource: globalRoot.resolve('session-1.json') },
                            { name: 'session-2.json', resource: globalRoot.resolve('session-2.json') }
                        ]
                    } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).seedFromGlobalStorage(workspaceRoot);

                expect(copiedFiles).to.have.lengthOf(3);
                expect(copiedFiles.map(f => f.source)).to.include(`${GLOBAL_CONFIG_DIR}/chatSessions/index.json`);
                expect(copiedFiles.map(f => f.source)).to.include(`${GLOBAL_CONFIG_DIR}/chatSessions/session-1.json`);
                expect(copiedFiles.map(f => f.source)).to.include(`${GLOBAL_CONFIG_DIR}/chatSessions/session-2.json`);

                expect(copiedFiles.map(f => f.target)).to.include(`${WORKSPACE_ROOT}/.theia/chatSessions/index.json`);
                expect(copiedFiles.map(f => f.target)).to.include(`${WORKSPACE_ROOT}/.theia/chatSessions/session-1.json`);
                expect(copiedFiles.map(f => f.target)).to.include(`${WORKSPACE_ROOT}/.theia/chatSessions/session-2.json`);
            });

            it('should skip seeding when global index does not exist', async () => {
                const workspaceRoot = new URI(`${WORKSPACE_ROOT}/.theia/chatSessions`);

                mockFileService.exists.resetBehavior();
                mockFileService.exists.resolves(false);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).seedFromGlobalStorage(workspaceRoot);

                expect(copiedFiles).to.be.empty;
            });

            it('should skip seeding when global directory is empty', async () => {
                const workspaceRoot = new URI(`${WORKSPACE_ROOT}/.theia/chatSessions`);
                const globalRoot = new URI(`${GLOBAL_CONFIG_DIR}/chatSessions`);

                // Global directory is empty
                mockFileService.resolve.resetBehavior();
                mockFileService.resolve
                    .withArgs(sinon.match((uri: URI) => uri.toString() === globalRoot.toString()))
                    .resolves({ children: [] } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).seedFromGlobalStorage(workspaceRoot);

                expect(copiedFiles).to.be.empty;
            });

            it('should skip non-JSON files during seeding', async () => {
                const workspaceRoot = new URI(`${WORKSPACE_ROOT}/.theia/chatSessions`);
                const globalRoot = new URI(`${GLOBAL_CONFIG_DIR}/chatSessions`);

                mockFileService.resolve.resetBehavior();
                mockFileService.resolve
                    .withArgs(sinon.match((uri: URI) => uri.toString() === globalRoot.toString()))
                    .resolves({
                        children: [
                            { name: 'index.json', resource: globalRoot.resolve('index.json') },
                            { name: 'session-1.json', resource: globalRoot.resolve('session-1.json') },
                            { name: 'backup.txt', resource: globalRoot.resolve('backup.txt') },
                            { name: '.gitkeep', resource: globalRoot.resolve('.gitkeep') }
                        ]
                    } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).seedFromGlobalStorage(workspaceRoot);

                expect(copiedFiles).to.have.lengthOf(2);
                expect(copiedFiles.map(f => f.source)).to.include(`${GLOBAL_CONFIG_DIR}/chatSessions/index.json`);
                expect(copiedFiles.map(f => f.source)).to.include(`${GLOBAL_CONFIG_DIR}/chatSessions/session-1.json`);
                expect(copiedFiles.map(f => f.source)).to.not.include(`${GLOBAL_CONFIG_DIR}/chatSessions/backup.txt`);
            });

            it('should use custom global path when configured', async () => {
                mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns({
                    ...DEFAULT_STORAGE_VALUE,
                    scope: 'workspace',
                    globalPath: CUSTOM_GLOBAL_PATH
                });

                const workspaceRoot = new URI(`${WORKSPACE_ROOT}/.theia/chatSessions`);
                const customGlobalRoot = new URI(`file://${CUSTOM_GLOBAL_PATH}`);

                // Global index exists at custom path
                mockFileService.exists.resetBehavior();
                mockFileService.exists
                    .withArgs(sinon.match((uri: URI) => uri.toString().includes(CUSTOM_GLOBAL_PATH)))
                    .resolves(true);

                // Custom global directory has content
                mockFileService.resolve.resetBehavior();
                mockFileService.resolve
                    .withArgs(sinon.match((uri: URI) => uri.toString() === customGlobalRoot.toString()))
                    .resolves({
                        children: [
                            { name: 'index.json', resource: customGlobalRoot.resolve('index.json') }
                        ]
                    } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).seedFromGlobalStorage(workspaceRoot);

                expect(copiedFiles).to.have.lengthOf(1);
                expect(copiedFiles[0].source).to.equal(`file://${CUSTOM_GLOBAL_PATH}/index.json`);
            });
        });

        describe('ensureStorageReady with seeding', () => {
            it('should seed workspace storage when index does not exist', async () => {
                mockWorkspaceService.roots = Promise.resolve([
                    { resource: new URI(WORKSPACE_ROOT), isDirectory: true } as FileStat
                ]);

                const workspaceStorageRoot = `${WORKSPACE_ROOT}/.theia/chatSessions`;
                const globalRoot = new URI(`${GLOBAL_CONFIG_DIR}/chatSessions`);

                mockFileService.exists.resetBehavior();
                mockFileService.resolve.resetBehavior();

                // Workspace index does not exist (new workspace storage)
                mockFileService.exists
                    .withArgs(sinon.match((uri: URI) => uri.toString() === `${workspaceStorageRoot}/index.json`))
                    .resolves(false);

                mockFileService.exists
                    .withArgs(sinon.match((uri: URI) => uri.toString() === `${GLOBAL_CONFIG_DIR}/chatSessions/index.json`))
                    .resolves(true);

                mockFileService.resolve
                    .withArgs(sinon.match((uri: URI) => uri.toString() === globalRoot.toString()))
                    .resolves({
                        children: [
                            { name: 'index.json', resource: globalRoot.resolve('index.json') },
                            { name: 'session-1.json', resource: globalRoot.resolve('session-1.json') }
                        ]
                    } as never);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).ensureStorageReady();

                expect(seedFromGlobalStorageSpy.called).to.be.true;
            });

            it('should not seed workspace storage when index already exists', async () => {
                mockWorkspaceService.roots = Promise.resolve([
                    { resource: new URI(WORKSPACE_ROOT), isDirectory: true } as FileStat
                ]);

                const workspaceStorageRoot = `${WORKSPACE_ROOT}/.theia/chatSessions`;

                // Reset behavior and configure specific response
                mockFileService.exists.resetBehavior();

                // Workspace index exists (existing workspace storage)
                mockFileService.exists
                    .withArgs(sinon.match((uri: URI) => uri.toString() === `${workspaceStorageRoot}/index.json`))
                    .resolves(true);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).ensureStorageReady();

                expect(seedFromGlobalStorageSpy.called).to.be.false;
            });

            it('should not seed when scope is global', async () => {
                mockPreferenceService.get.withArgs(SESSION_STORAGE_PREF).returns({
                    ...DEFAULT_STORAGE_VALUE,
                    scope: 'global'
                });

                // Index does not exist
                mockFileService.exists.resetBehavior();
                mockFileService.exists.resolves(false);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).ensureStorageReady();

                expect(seedFromGlobalStorageSpy.called).to.be.false;
            });

            it('should not seed when falling back from workspace to global (no workspace open)', async () => {
                // No workspace open
                mockWorkspaceService.roots = Promise.resolve([]);

                // Index does not exist
                mockFileService.exists.resetBehavior();
                mockFileService.exists.resolves(false);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).ensureStorageReady();

                // No seeding because the resolved storage is global (fallback), not workspace
                expect(seedFromGlobalStorageSpy.called).to.be.false;
            });

            it('should only seed once even when ensureStorageReady is called multiple times', async () => {
                mockWorkspaceService.roots = Promise.resolve([
                    { resource: new URI(WORKSPACE_ROOT), isDirectory: true } as FileStat
                ]);

                const workspaceStorageRoot = `${WORKSPACE_ROOT}/.theia/chatSessions`;
                const globalRoot = new URI(`${GLOBAL_CONFIG_DIR}/chatSessions`);

                // Reset behaviors to configure specific responses
                mockFileService.exists.resetBehavior();
                mockFileService.resolve.resetBehavior();

                // First call: workspace index does not exist
                mockFileService.exists
                    .withArgs(sinon.match((uri: URI) => uri.toString() === `${workspaceStorageRoot}/index.json`))
                    .resolves(false);

                // Global index exists
                mockFileService.exists
                    .withArgs(sinon.match((uri: URI) => uri.toString() === `${GLOBAL_CONFIG_DIR}/chatSessions/index.json`))
                    .resolves(true);

                // Global directory has content
                mockFileService.resolve
                    .withArgs(sinon.match((uri: URI) => uri.toString() === globalRoot.toString()))
                    .resolves({
                        children: [
                            { name: 'index.json', resource: globalRoot.resolve('index.json') }
                        ]
                    } as never);

                // First call seeds
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).ensureStorageReady();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (chatSessionStore as any).ensureStorageReady();
                // Second call should not have seeded again
                expect(seedFromGlobalStorageSpy.calledOnce).to.be.true;
            });
        });
    });
});
