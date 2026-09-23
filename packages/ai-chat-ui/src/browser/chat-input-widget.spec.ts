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
