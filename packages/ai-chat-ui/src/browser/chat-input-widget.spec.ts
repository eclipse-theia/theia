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
        // no-op
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
