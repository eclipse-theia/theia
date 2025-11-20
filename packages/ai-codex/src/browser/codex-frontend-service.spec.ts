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
import * as path from 'path';

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container, interfaces } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { URI } from '@theia/core/lib/common/uri';
import { CODEX_API_KEY_PREF, CodexService, CodexBackendRequest } from '../common';
import { API_KEY_PREF } from '@theia/ai-openai/lib/common/openai-preferences';

import type { CodexFrontendService, CodexClientImpl } from './codex-frontend-service';

disableJSDOM();

describe('CodexFrontendService', () => {
    let container: Container;
    let CodexFrontendServiceConstructor: interfaces.Newable<CodexFrontendService>;
    let CodexClientImplConstructor: interfaces.Newable<CodexClientImpl>;
    let mockPreferenceService: PreferenceService;
    let mockBackendService: CodexService;

    before(async () => {
        disableJSDOM = enableJSDOM();

        const serviceModule = await import('./codex-frontend-service');
        CodexFrontendServiceConstructor = serviceModule.CodexFrontendService;
        CodexClientImplConstructor = serviceModule.CodexClientImpl;
    });

    beforeEach(() => {
        container = new Container();

        mockPreferenceService = {
            get: sinon.stub()
        } as unknown as PreferenceService;

        mockBackendService = {
            send: sinon.stub<[CodexBackendRequest, string], Promise<void>>().resolves(),
            cancel: sinon.stub<[string], void>()
        };

        const mockWorkspaceService = {
            roots: Promise.resolve([{ resource: new URI('file:///test/workspace') }])
        } as WorkspaceService;

        container.bind(PreferenceService).toConstantValue(mockPreferenceService);
        container.bind(CodexService).toConstantValue(mockBackendService);
        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService);
        container.bind(CodexClientImplConstructor).toSelf().inSingletonScope();
        container.bind(CodexFrontendServiceConstructor).toSelf();
    });

    afterEach(() => {
        sinon.restore();
    });

    after(() => {
        disableJSDOM();
    });

    describe('API Key Preference Hierarchy', () => {
        it('should prioritize Codex-specific API key over shared OpenAI key', async () => {
            (mockPreferenceService.get as sinon.SinonStub).withArgs(CODEX_API_KEY_PREF).returns('codex-key-123');
            (mockPreferenceService.get as sinon.SinonStub).withArgs(API_KEY_PREF).returns('openai-key-456');

            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1' });

            expect((mockBackendService.send as sinon.SinonStub).calledOnce).to.be.true;
            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.apiKey).to.equal('codex-key-123');
        });

        it('should fall back to shared OpenAI API key when Codex key not set', async () => {
            (mockPreferenceService.get as sinon.SinonStub).withArgs(CODEX_API_KEY_PREF).returns(undefined);
            (mockPreferenceService.get as sinon.SinonStub).withArgs(API_KEY_PREF).returns('openai-key-456');

            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.apiKey).to.equal('openai-key-456');
        });

        it('should return undefined when neither key is set', async () => {
            (mockPreferenceService.get as sinon.SinonStub).withArgs(CODEX_API_KEY_PREF).returns(undefined);
            (mockPreferenceService.get as sinon.SinonStub).withArgs(API_KEY_PREF).returns(undefined);

            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.apiKey).to.be.undefined;
        });

        it('should treat empty Codex key as not set', async () => {
            (mockPreferenceService.get as sinon.SinonStub).withArgs(CODEX_API_KEY_PREF).returns('');
            (mockPreferenceService.get as sinon.SinonStub).withArgs(API_KEY_PREF).returns('openai-key-456');

            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.apiKey).to.equal('openai-key-456');
        });

        it('should treat whitespace-only Codex key as not set', async () => {
            (mockPreferenceService.get as sinon.SinonStub).withArgs(CODEX_API_KEY_PREF).returns('   ');
            (mockPreferenceService.get as sinon.SinonStub).withArgs(API_KEY_PREF).returns('openai-key-456');

            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.apiKey).to.equal('openai-key-456');
        });

        it('should treat empty OpenAI key as not set', async () => {
            (mockPreferenceService.get as sinon.SinonStub).withArgs(CODEX_API_KEY_PREF).returns(undefined);
            (mockPreferenceService.get as sinon.SinonStub).withArgs(API_KEY_PREF).returns('');

            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.apiKey).to.be.undefined;
        });

        it('should treat whitespace-only OpenAI key as not set', async () => {
            (mockPreferenceService.get as sinon.SinonStub).withArgs(CODEX_API_KEY_PREF).returns(undefined);
            (mockPreferenceService.get as sinon.SinonStub).withArgs(API_KEY_PREF).returns('   ');

            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.apiKey).to.be.undefined;
        });
    });

    describe('Sandbox Mode Configuration', () => {
        beforeEach(() => {
            (mockPreferenceService.get as sinon.SinonStub).withArgs(CODEX_API_KEY_PREF).returns('test-key');
        });

        it('should default to workspace-write when no sandboxMode is provided in request', async () => {
            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.options?.sandboxMode).to.equal('workspace-write');
        });

        it('should use sandboxMode from request when provided', async () => {
            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1', sandboxMode: 'read-only' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.options?.sandboxMode).to.equal('read-only');
        });

        it('should use danger-full-access when provided in request', async () => {
            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1', sandboxMode: 'danger-full-access' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.options?.sandboxMode).to.equal('danger-full-access');
        });

        it('should default to workspace-write when request sandboxMode is undefined', async () => {
            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'session-1', sandboxMode: undefined });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.options?.sandboxMode).to.equal('workspace-write');
        });
    });

    describe('Request Building', () => {
        beforeEach(() => {
            (mockPreferenceService.get as sinon.SinonStub).withArgs(CODEX_API_KEY_PREF).returns('test-key');
        });

        it('should include workspace root in request', async () => {
            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test prompt', sessionId: 'session-1' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            const expectedPath = path.join('test', 'workspace');
            expect(backendRequest.options?.workingDirectory).to.include(expectedPath);
        });

        it('should pass prompt to backend', async () => {
            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'my test prompt', sessionId: 'session-1' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.prompt).to.equal('my test prompt');
        });

        it('should pass sessionId to backend', async () => {
            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({ prompt: 'test', sessionId: 'my-session-123' });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            expect(backendRequest.sessionId).to.equal('my-session-123');
        });

        it('should merge custom options with defaults', async () => {
            const service = container.get<CodexFrontendService>(CodexFrontendServiceConstructor);
            await service.send({
                prompt: 'test',
                sessionId: 'session-1',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                options: { customOption: 'value' } as any // Testing dynamic options extension
            });

            const backendRequest = (mockBackendService.send as sinon.SinonStub).firstCall.args[0];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((backendRequest.options as any)?.customOption).to.equal('value'); // Accessing dynamic test property
            expect(backendRequest.options?.sandboxMode).to.equal('workspace-write');
        });
    });
});
