// *****************************************************************************
// Copyright (C) 2026 EclipseSource and others.
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

import 'reflect-metadata';

import { expect } from 'chai';
import { ReasoningLevel, ReasoningSettings, ReasoningSupport } from '@theia/ai-core';
import { AISettingsService } from '@theia/ai-core/lib/common';
import { ChatModel } from '@theia/ai-chat';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { AIChatInputWidget } from './chat-input-widget';

disableJSDOM();

class TestChatInputWidget extends AIChatInputWidget {

    readonly updateCalls: Array<{ agentId: string; modeId?: string; preserveOverrides?: boolean }> = [];

    setReceivingAgent(agentId: string, modeId?: string): void {
        this.receivingAgent = {
            agentId,
            modes: [],
            currentModeId: modeId
        };
    }

    renderUpdates = 0;

    setCapabilityState(saved: Record<string, boolean> | undefined, current = saved ?? {}): void {
        this.savedCapabilityOverrides = saved;
        this.userCapabilityOverrides = new Map(Object.entries(current));
    }

    setSavedCapabilityLoader(load: () => Promise<Record<string, boolean> | undefined>): void {
        (this as unknown as { aiSettingsService: Pick<AISettingsService, 'getAgentSettings'> }).aiSettingsService = {
            getAgentSettings: async () => ({ capabilityOverrides: await load() })
        };
    }

    refreshSavedCapabilityOverridesForTest(agentId: string | undefined): Promise<void> {
        return this.refreshSavedCapabilityOverrides(agentId);
    }

    capabilityStateForTest(): { saved: Record<string, boolean> | undefined; current: Record<string, boolean> } {
        return { saved: this.savedCapabilityOverrides, current: Object.fromEntries(this.userCapabilityOverrides) };
    }

    setChatModelForTest(id: string): void {
        this._chatModel = { id } as ChatModel;
    }

    refreshCapabilitiesForTest(): Promise<void> {
        return this.refreshCapabilities();
    }

    setReasoningState(support: ReasoningSupport, saved?: ReasoningSettings): void {
        this.currentReasoningSupport = support;
        this.savedReasoning = saved;
        (this as unknown as { chatService: unknown }).chatService = { getSessions: () => [] };
    }

    currentReasoningLevelForTest(): ReasoningLevel | undefined {
        return this.getCurrentReasoningLevel();
    }

    setModelSelectorState(currentModelId?: string): void {
        this.availableModels = [{
            id: 'available-model',
            status: { status: 'ready' },
            request: async () => ({ text: '' })
        }];
        (this as unknown as { chatAgentService: unknown }).chatAgentService = {
            getAgent: (agentId: string, includeHidden: boolean) => {
                expect(includeHidden).to.equal(true);
                if (agentId === 'unknown-agent') {
                    return undefined;
                }
                return { languageModelRequirements: agentId === 'model-agent' ? [{ purpose: 'chat' }] : [] };
            }
        };
        (this as unknown as { chatService: unknown }).chatService = {
            getSessions: () => [{ model: { id: undefined, settings: { commonSettings: { modelId: currentModelId } } } }]
        };
        (this as unknown as { favoriteModels: unknown }).favoriteModels = { isFavorite: () => true };
    }

    modelSelectorPropsForTest(): ReturnType<AIChatInputWidget['getModelSelectorProps']> {
        return this.getModelSelectorProps();
    }

    protected override async updateCapabilitiesForAgent(agentId: string, modeId?: string, preserveOverrides?: boolean): Promise<void> {
        this.updateCalls.push({ agentId, modeId, preserveOverrides });
    }

    override update(): void {
        this.renderUpdates++;
    }
}

describe('AIChatInputWidget', () => {
    before(() => disableJSDOM = enableJSDOM());
    after(() => disableJSDOM());

    describe('getModelSelectorProps', () => {
        it('updates visibility when switching between agents with and without model requirements', () => {
            const widget = new TestChatInputWidget();
            widget.setModelSelectorState();
            widget.setReceivingAgent('model-agent');
            expect(widget.modelSelectorPropsForTest().show).to.equal(true);

            widget.setReceivingAgent('ClaudeCode');
            const props = widget.modelSelectorPropsForTest();
            expect(props.models).to.have.length(1);
            expect(props.show).to.equal(false);

            widget.setReceivingAgent('model-agent');
            expect(widget.modelSelectorPropsForTest().show).to.equal(true);
        });

        it('hides the selector without a resolved agent', () => {
            const widget = new TestChatInputWidget();
            widget.setModelSelectorState();
            expect(widget.modelSelectorPropsForTest().show).to.equal(false);

            widget.setReceivingAgent('unknown-agent');
            expect(widget.modelSelectorPropsForTest().show).to.equal(false);
        });

        it('hides the selector for an agent without model requirements while preserving the session override', () => {
            const widget = new TestChatInputWidget();
            widget.setModelSelectorState('saved-model');
            widget.setReceivingAgent('ClaudeCode');

            const props = widget.modelSelectorPropsForTest();
            expect(props.show).to.equal(false);
            expect(props.currentModelId).to.equal('saved-model');

            widget.setReceivingAgent('model-agent');
            expect(widget.modelSelectorPropsForTest().currentModelId).to.equal('saved-model');
        });
    });

    describe('getCurrentReasoningLevel', () => {
        const oSeries: ReasoningSupport = { supportedLevels: ['off', 'low', 'medium', 'high', 'auto'], defaultLevel: 'auto' };

        it('clamps a persisted level the current model does not support to the nearest supported one', () => {
            const widget = new TestChatInputWidget();
            widget.setReasoningState(oSeries, { level: 'minimal' });

            expect(widget.currentReasoningLevelForTest()).to.equal('low');
        });

        it('keeps a persisted level the current model supports', () => {
            const widget = new TestChatInputWidget();
            widget.setReasoningState(oSeries, { level: 'high' });

            expect(widget.currentReasoningLevelForTest()).to.equal('high');
        });
    });

    describe('refreshSavedCapabilityOverrides', () => {
        let widget: TestChatInputWidget;

        beforeEach(() => {
            widget = new TestChatInputWidget();
            widget.setReceivingAgent('test-agent');
        });

        it('adopts externally saved overrides when there are no unsaved edits', async () => {
            widget.setCapabilityState({ capability: false });
            widget.setSavedCapabilityLoader(async () => ({ capability: true, another: false }));

            await widget.refreshSavedCapabilityOverridesForTest('test-agent');

            expect(widget.capabilityStateForTest()).to.deep.equal({
                saved: { capability: true, another: false },
                current: { capability: true, another: false }
            });
            expect(widget.hasAnyChangesFromSaved()).to.equal(false);
            expect(widget.renderUpdates).to.equal(1);
        });

        it('preserves unsaved edits while updating the baseline', async () => {
            widget.setCapabilityState({ capability: false }, { capability: true });
            widget.setSavedCapabilityLoader(async () => ({ another: false }));

            await widget.refreshSavedCapabilityOverridesForTest('test-agent');

            expect(widget.capabilityStateForTest()).to.deep.equal({ saved: { another: false }, current: { capability: true } });
            expect(widget.hasAnyChangesFromSaved()).to.equal(true);
            expect(widget.renderUpdates).to.equal(1);
        });

        it('clears the unsaved indicator when an external save matches local edits', async () => {
            widget.setCapabilityState({ capability: false }, { capability: true });
            widget.setSavedCapabilityLoader(async () => ({ capability: true }));

            await widget.refreshSavedCapabilityOverridesForTest('test-agent');

            expect(widget.hasAnyChangesFromSaved()).to.equal(false);
            expect(widget.renderUpdates).to.equal(1);
        });

        it('adopts an external reset when there are no unsaved edits', async () => {
            widget.setCapabilityState({ capability: false });
            widget.setSavedCapabilityLoader(async () => undefined);

            await widget.refreshSavedCapabilityOverridesForTest('test-agent');

            expect(widget.capabilityStateForTest()).to.deep.equal({ saved: undefined, current: {} });
            expect(widget.hasAnyChangesFromSaved()).to.equal(false);
        });

        it('preserves edits made while the settings read is pending, including on reset', async () => {
            const saved = new Deferred<Record<string, boolean> | undefined>();
            widget.setCapabilityState({ capability: false });
            widget.setSavedCapabilityLoader(() => saved.promise);
            const refresh = widget.refreshSavedCapabilityOverridesForTest('test-agent');
            widget.setCapabilityState({ capability: false }, { capability: true });
            saved.resolve(undefined);

            await refresh;

            expect(widget.capabilityStateForTest()).to.deep.equal({ saved: undefined, current: { capability: true } });
            expect(widget.hasAnyChangesFromSaved()).to.equal(true);
        });

        it('discards a pending refresh after switching agents, even when switching back', async () => {
            const saved = new Deferred<Record<string, boolean> | undefined>();
            widget.setSavedCapabilityLoader(() => saved.promise);
            const refresh = widget.refreshSavedCapabilityOverridesForTest('test-agent');
            widget.setReceivingAgent('another-agent');
            widget.setReceivingAgent('test-agent');
            widget.setCapabilityState({ another: false });
            saved.resolve({ capability: true });

            await refresh;

            expect(widget.capabilityStateForTest()).to.deep.equal({ saved: { another: false }, current: { another: false } });
            expect(widget.renderUpdates).to.equal(0);
        });

        it('discards a pending refresh after switching sessions with the same agent', async () => {
            const saved = new Deferred<Record<string, boolean> | undefined>();
            widget.setChatModelForTest('first');
            widget.setSavedCapabilityLoader(() => saved.promise);
            const refresh = widget.refreshSavedCapabilityOverridesForTest('test-agent');
            widget.setChatModelForTest('second');
            widget.setCapabilityState({ another: false });
            saved.resolve({ capability: true });

            await refresh;

            expect(widget.capabilityStateForTest()).to.deep.equal({ saved: { another: false }, current: { another: false } });
            expect(widget.renderUpdates).to.equal(0);
        });

        it('does not read settings without a matching receiving agent', async () => {
            widget.setSavedCapabilityLoader(async () => {
                throw new Error('Unexpected settings read');
            });

            await widget.refreshSavedCapabilityOverridesForTest(undefined);
            await widget.refreshSavedCapabilityOverridesForTest('another-agent');
        });
    });

    describe('refreshCapabilities', () => {
        it('preserves capability selections while reloading prompt-template capabilities', async () => {
            const widget = new TestChatInputWidget();
            widget.setReceivingAgent('test-agent', 'test-mode');

            await widget.refreshCapabilitiesForTest();

            expect(widget.updateCalls).to.deep.equal([{
                agentId: 'test-agent',
                modeId: 'test-mode',
                preserveOverrides: true
            }]);
        });
    });
});
