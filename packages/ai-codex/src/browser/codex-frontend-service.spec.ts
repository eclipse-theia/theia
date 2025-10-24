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

import { expect } from 'chai';
import { Container } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core';
import { API_KEY_PREF } from '@theia/ai-openai/lib/common/openai-preferences';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { CodexFrontendService, CodexClientImpl } from './codex-frontend-service';
import { CodexService, CODEX_API_KEY_PREF, CODEX_SANDBOX_MODE_PREF } from '../common';

describe('CodexFrontendService', () => {
    let service: CodexFrontendService;
    let preferenceService: PreferenceService;
    let container: Container;

    beforeEach(() => {
        container = new Container();

        // Mock PreferenceService
        const mockPreferenceService = {
            preferences: new Map<string, string>(),
            get<T>(key: string): T | undefined {
                return this.preferences.get(key) as T | undefined;
            },
            set(key: string, value: string): void {
                this.preferences.set(key, value);
            },
            clear(): void {
                this.preferences.clear();
            }
        };

        // Mock CodexService (backend)
        const mockCodexService = {
            send: () => Promise.resolve(),
            cancel: () => Promise.resolve()
        };

        // Mock WorkspaceService
        const mockWorkspaceService = {
            roots: Promise.resolve([])
        };

        container.bind(PreferenceService).toConstantValue(mockPreferenceService as any);
        container.bind(CodexService).toConstantValue(mockCodexService as any);
        container.bind(WorkspaceService).toConstantValue(mockWorkspaceService as any);
        container.bind(CodexClientImpl).toSelf().inSingletonScope();
        container.bind(CodexFrontendService).toSelf().inSingletonScope();

        service = container.get(CodexFrontendService);
        preferenceService = container.get(PreferenceService) as any;
    });

    afterEach(() => {
        (preferenceService as any).clear();
    });

    describe('API Key Preference Hierarchy', () => {
        it('should use Codex-specific API key when set (highest priority)', () => {
            (preferenceService as any).set(CODEX_API_KEY_PREF, 'codex-key-123');
            (preferenceService as any).set(API_KEY_PREF, 'openai-key-456');

            const apiKey = (service as any).getApiKey();

            expect(apiKey).to.equal('codex-key-123');
        });

        it('should fall back to shared OpenAI API key when Codex key not set', () => {
            (preferenceService as any).set(API_KEY_PREF, 'openai-key-456');

            const apiKey = (service as any).getApiKey();

            expect(apiKey).to.equal('openai-key-456');
        });

        it('should return undefined when neither key is set (env var fallback)', () => {
            const apiKey = (service as any).getApiKey();

            expect(apiKey).to.be.undefined;
        });

        it('should treat empty Codex key as not set and fall back to OpenAI key', () => {
            (preferenceService as any).set(CODEX_API_KEY_PREF, '');
            (preferenceService as any).set(API_KEY_PREF, 'openai-key-456');

            const apiKey = (service as any).getApiKey();

            expect(apiKey).to.equal('openai-key-456');
        });

        it('should treat whitespace-only Codex key as not set and fall back', () => {
            (preferenceService as any).set(CODEX_API_KEY_PREF, '   ');
            (preferenceService as any).set(API_KEY_PREF, 'openai-key-456');

            const apiKey = (service as any).getApiKey();

            expect(apiKey).to.equal('openai-key-456');
        });

        it('should treat empty OpenAI key as not set and return undefined', () => {
            (preferenceService as any).set(API_KEY_PREF, '');

            const apiKey = (service as any).getApiKey();

            expect(apiKey).to.be.undefined;
        });

        it('should treat whitespace-only OpenAI key as not set', () => {
            (preferenceService as any).set(API_KEY_PREF, '   ');

            const apiKey = (service as any).getApiKey();

            expect(apiKey).to.be.undefined;
        });

        it('should handle both keys being empty strings', () => {
            (preferenceService as any).set(CODEX_API_KEY_PREF, '');
            (preferenceService as any).set(API_KEY_PREF, '');

            const apiKey = (service as any).getApiKey();

            expect(apiKey).to.be.undefined;
        });
    });

    describe('Sandbox Mode Preference', () => {
        it('should use workspace-write as default when no preference is set', () => {
            const sandboxMode = (service as any).getSandboxMode();

            expect(sandboxMode).to.equal('workspace-write');
        });

        it('should use read-only mode when preference is set', () => {
            (preferenceService as any).set(CODEX_SANDBOX_MODE_PREF, 'read-only');

            const sandboxMode = (service as any).getSandboxMode();

            expect(sandboxMode).to.equal('read-only');
        });

        it('should use danger-full-access mode when preference is set', () => {
            (preferenceService as any).set(CODEX_SANDBOX_MODE_PREF, 'danger-full-access');

            const sandboxMode = (service as any).getSandboxMode();

            expect(sandboxMode).to.equal('danger-full-access');
        });

        it('should fall back to workspace-write for invalid values', () => {
            (preferenceService as any).set(CODEX_SANDBOX_MODE_PREF, 'invalid-mode');

            const sandboxMode = (service as any).getSandboxMode();

            expect(sandboxMode).to.equal('workspace-write');
        });

        it('should fall back to workspace-write for empty string', () => {
            (preferenceService as any).set(CODEX_SANDBOX_MODE_PREF, '');

            const sandboxMode = (service as any).getSandboxMode();

            expect(sandboxMode).to.equal('workspace-write');
        });
    });
});
