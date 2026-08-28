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

/* eslint-disable @typescript-eslint/no-explicit-any */

import { expect } from 'chai';
import { Emitter } from '@theia/core/lib/common/event';
import { DEFAULT_CHAT_AGENT_PREF } from '@theia/ai-chat/lib/common/ai-chat-preferences';
import { DEFAULT_TOOL_CONFIRMATION_PREFERENCE, TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import {
    AI_CHAT_USED_CONTEXT_KEY,
    AI_DEFAULT_AGENT_CONTEXT_KEY,
    AI_MODEL_READY_CONTEXT_KEY,
    AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY,
    AiWalkthroughContextKeys
} from './ai-walkthrough-context-keys';

describe('AiWalkthroughContextKeys', () => {

    let contextKeys: AiWalkthroughContextKeys;
    let keyValues: Record<string, boolean>;
    let models: { status: { status: string } }[];
    let sessions: { title?: string }[];
    let persistedSessions: boolean;
    let preferences: Record<string, unknown>;
    let productDefaults: Record<string, unknown>;
    let onLanguageModelChangeEmitter: Emitter<void>;
    let onSessionEventEmitter: Emitter<void>;
    let onPreferenceChangedEmitter: Emitter<{ preferenceName: string }>;

    beforeEach(() => {
        keyValues = {};
        models = [];
        sessions = [];
        persistedSessions = false;
        preferences = {};
        productDefaults = {};
        onLanguageModelChangeEmitter = new Emitter();
        onSessionEventEmitter = new Emitter();
        onPreferenceChangedEmitter = new Emitter();

        contextKeys = new AiWalkthroughContextKeys();
        (contextKeys as any).contextKeyService = {
            createKey: (key: string, defaultValue: boolean) => {
                keyValues[key] = defaultValue;
                return {
                    get: () => keyValues[key],
                    set: (value: boolean) => { keyValues[key] = value; }
                };
            }
        };
        (contextKeys as any).languageModelRegistry = {
            onChange: onLanguageModelChangeEmitter.event,
            getLanguageModels: () => Promise.resolve(models)
        };
        (contextKeys as any).chatService = {
            onSessionEvent: onSessionEventEmitter.event,
            getSessions: () => sessions,
            hasPersistedSessions: () => Promise.resolve(persistedSessions)
        };
        (contextKeys as any).preferenceService = {
            onPreferenceChanged: onPreferenceChangedEmitter.event,
            ready: Promise.resolve(),
            get: (key: string, defaultValue: unknown) => preferences[key] ?? defaultValue,
            // Only the values the user set, which is what distinguishes a decision from a product default.
            inspect: (key: string) => ({ preferenceName: key, defaultValue: productDefaults[key], globalValue: preferences[key] })
        };
        (contextKeys as any).init();
    });

    afterEach(() => {
        contextKeys.onStop();
        onLanguageModelChangeEmitter.dispose();
        onSessionEventEmitter.dispose();
        onPreferenceChangedEmitter.dispose();
    });

    describe(AI_MODEL_READY_CONTEXT_KEY, () => {
        it('should be false without a usable model', async () => {
            models = [{ status: { status: 'unavailable' } }];
            await (contextKeys as any).updateModelState();

            expect(keyValues[AI_MODEL_READY_CONTEXT_KEY]).to.be.false;
        });

        it('should become true once a model is ready', async () => {
            models = [{ status: { status: 'unavailable' } }, { status: { status: 'ready' } }];
            await (contextKeys as any).updateModelState();

            expect(keyValues[AI_MODEL_READY_CONTEXT_KEY]).to.be.true;
        });

        it('should follow the registry when a model becomes unusable again', async () => {
            models = [{ status: { status: 'ready' } }];
            await (contextKeys as any).updateModelState();

            models = [{ status: { status: 'unavailable' } }];
            await (contextKeys as any).updateModelState();

            expect(keyValues[AI_MODEL_READY_CONTEXT_KEY]).to.be.false;
        });
    });

    describe(AI_CHAT_USED_CONTEXT_KEY, () => {
        it('should be false while no chat was held', async () => {
            sessions = [{}];
            await (contextKeys as any).updateChatState();

            expect(keyValues[AI_CHAT_USED_CONTEXT_KEY]).to.be.false;
        });

        it('should become true for a session that has a title', async () => {
            sessions = [{ title: 'How do I build this?' }];
            await (contextKeys as any).updateChatState();

            expect(keyValues[AI_CHAT_USED_CONTEXT_KEY]).to.be.true;
        });

        it('should become true for a persisted session of an earlier run', async () => {
            persistedSessions = true;
            await (contextKeys as any).updateChatState();

            expect(keyValues[AI_CHAT_USED_CONTEXT_KEY]).to.be.true;
        });

        it('should stay true once the chats are gone', async () => {
            sessions = [{ title: 'How do I build this?' }];
            await (contextKeys as any).updateChatState();

            sessions = [];
            await (contextKeys as any).updateChatState();

            expect(keyValues[AI_CHAT_USED_CONTEXT_KEY]).to.be.true;
        });

        it('should not fail when the persisted sessions cannot be read', async () => {
            (contextKeys as any).chatService.hasPersistedSessions = () => Promise.reject(new Error('no storage'));

            await (contextKeys as any).updateChatState();

            expect(keyValues[AI_CHAT_USED_CONTEXT_KEY]).to.be.false;
        });
    });

    describe(AI_DEFAULT_AGENT_CONTEXT_KEY, () => {
        it('should be false while no default agent is configured', () => {
            (contextKeys as any).updateDefaultAgentState();

            expect(keyValues[AI_DEFAULT_AGENT_CONTEXT_KEY]).to.be.false;
        });

        it('should be true for a configured default agent', () => {
            preferences[DEFAULT_CHAT_AGENT_PREF] = 'Coder';
            (contextKeys as any).updateDefaultAgentState();

            expect(keyValues[AI_DEFAULT_AGENT_CONTEXT_KEY]).to.be.true;
        });
    });

    describe(AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY, () => {
        it('should be false while every tool call is confirmed and no tool was pre-approved', () => {
            (contextKeys as any).updateToolConfirmationState();

            expect(keyValues[AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY]).to.be.false;
        });

        it('should be true once the default mode was changed', () => {
            preferences[DEFAULT_TOOL_CONFIRMATION_PREFERENCE] = ToolConfirmationMode.ALWAYS_ALLOW;
            (contextKeys as any).updateToolConfirmationState();

            expect(keyValues[AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY]).to.be.true;
        });

        it('should be true once single tools were pre-approved', () => {
            preferences[TOOL_CONFIRMATION_PREFERENCE] = { 'some-tool': ToolConfirmationMode.ALWAYS_ALLOW };
            (contextKeys as any).updateToolConfirmationState();

            expect(keyValues[AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY]).to.be.true;
        });

        it('should stay false for defaults the product ships rather than the user setting them', () => {
            productDefaults[DEFAULT_TOOL_CONFIRMATION_PREFERENCE] = ToolConfirmationMode.ALWAYS_ALLOW;
            productDefaults[TOOL_CONFIRMATION_PREFERENCE] = { 'some-tool': ToolConfirmationMode.ALWAYS_ALLOW };
            (contextKeys as any).updateToolConfirmationState();

            expect(keyValues[AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY]).to.be.false;
        });

        it('should stay false after the per-tool settings were reset to an empty map', () => {
            preferences[TOOL_CONFIRMATION_PREFERENCE] = {};
            (contextKeys as any).updateToolConfirmationState();

            expect(keyValues[AI_TOOL_CONFIRMATION_CONFIGURED_CONTEXT_KEY]).to.be.false;
        });
    });
});
