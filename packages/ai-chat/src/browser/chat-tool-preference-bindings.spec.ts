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

import { expect } from 'chai';
import * as sinon from 'sinon';
import { ToolConfirmationManager } from './chat-tool-preference-bindings';
import { ToolConfirmationMode, TOOL_CONFIRMATION_PREFERENCE, ChatToolPreferences } from '../common/chat-tool-preferences';
import { ToolRequest } from '@theia/ai-core';
import { PreferenceService } from '@theia/core/lib/common/preferences';

describe('ToolConfirmationManager', () => {
    let manager: ToolConfirmationManager;
    let preferenceServiceMock: sinon.SinonStubbedInstance<PreferenceService>;
    let storedPreferences: { [toolId: string]: ToolConfirmationMode };

    const createToolRequest = (id: string, confirmAlwaysAllow?: boolean | string): ToolRequest => ({
        id,
        name: id,
        handler: async () => '',
        parameters: { type: 'object', properties: {} },
        confirmAlwaysAllow
    });

    const getPreferencesMock = (): ChatToolPreferences => ({
        get [TOOL_CONFIRMATION_PREFERENCE](): { [toolId: string]: ToolConfirmationMode } {
            return storedPreferences;
        }
    }) as unknown as ChatToolPreferences;

    beforeEach(() => {
        storedPreferences = {};

        preferenceServiceMock = {
            updateValue: sinon.stub().callsFake((_key: string, value: { [toolId: string]: ToolConfirmationMode }) => {
                storedPreferences = value;
                return Promise.resolve();
            })
        } as unknown as sinon.SinonStubbedInstance<PreferenceService>;

        manager = new ToolConfirmationManager();
        (manager as unknown as { preferences: ChatToolPreferences }).preferences = getPreferencesMock();
        (manager as unknown as { preferenceService: PreferenceService }).preferenceService = preferenceServiceMock;
    });

    describe('getConfirmationMode', () => {
        it('should return ALWAYS_ALLOW for regular tools by default', () => {
            const mode = manager.getConfirmationMode('regularTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('should return CONFIRM for confirmAlwaysAllow tools by default', () => {
            const toolRequest = createToolRequest('dangerousTool', true);
            const mode = manager.getConfirmationMode('dangerousTool', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('should return tool-specific preference when set', () => {
            storedPreferences['myTool'] = ToolConfirmationMode.DISABLED;
            const mode = manager.getConfirmationMode('myTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.DISABLED);
        });

        it('should return session override when set', () => {
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.ALWAYS_ALLOW, 'chat-1');
            const mode = manager.getConfirmationMode('myTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('should not inherit global ALWAYS_ALLOW for confirmAlwaysAllow tools', () => {
            storedPreferences['*'] = ToolConfirmationMode.ALWAYS_ALLOW;
            const toolRequest = createToolRequest('dangerousTool', true);
            const mode = manager.getConfirmationMode('dangerousTool', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('should inherit global DISABLED for confirmAlwaysAllow tools', () => {
            storedPreferences['*'] = ToolConfirmationMode.DISABLED;
            const toolRequest = createToolRequest('dangerousTool', true);
            const mode = manager.getConfirmationMode('dangerousTool', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.DISABLED);
        });
    });

    describe('setConfirmationMode', () => {
        it('should persist ALWAYS_ALLOW for regular tools when different from default', () => {
            storedPreferences['*'] = ToolConfirmationMode.CONFIRM;
            manager.setConfirmationMode('regularTool', ToolConfirmationMode.ALWAYS_ALLOW);
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPreferences['regularTool']).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('should persist ALWAYS_ALLOW for confirmAlwaysAllow tools', () => {
            const toolRequest = createToolRequest('dangerousTool', true);
            manager.setConfirmationMode('dangerousTool', ToolConfirmationMode.ALWAYS_ALLOW, toolRequest);
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPreferences['dangerousTool']).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('should not persist ALWAYS_ALLOW for regular tools when it matches default', () => {
            manager.setConfirmationMode('regularTool', ToolConfirmationMode.ALWAYS_ALLOW);
            expect(preferenceServiceMock.updateValue.called).to.be.false;
        });

        it('should remove entry when setting mode that matches effective default', () => {
            storedPreferences['regularTool'] = ToolConfirmationMode.CONFIRM;
            manager.setConfirmationMode('regularTool', ToolConfirmationMode.ALWAYS_ALLOW);
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPreferences['regularTool']).to.be.undefined;
        });

        it('should persist DISABLED for any tool', () => {
            manager.setConfirmationMode('anyTool', ToolConfirmationMode.DISABLED);
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPreferences['anyTool']).to.equal(ToolConfirmationMode.DISABLED);
        });

        it('should remove entry when setting CONFIRM for confirmAlwaysAllow tools (matches effective default)', () => {
            const toolRequest = createToolRequest('dangerousTool', true);
            storedPreferences['dangerousTool'] = ToolConfirmationMode.ALWAYS_ALLOW;
            manager.setConfirmationMode('dangerousTool', ToolConfirmationMode.CONFIRM, toolRequest);
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPreferences['dangerousTool']).to.be.undefined;
        });
    });

    describe('setSessionConfirmationMode', () => {
        it('should set session override for specific chat', () => {
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.ALWAYS_ALLOW, 'chat-1');
            expect(manager.getConfirmationMode('myTool', 'chat-1')).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
            expect(manager.getConfirmationMode('myTool', 'chat-2')).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('should prioritize session override over persisted preference', () => {
            storedPreferences['myTool'] = ToolConfirmationMode.DISABLED;
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.ALWAYS_ALLOW, 'chat-1');
            expect(manager.getConfirmationMode('myTool', 'chat-1')).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });
    });

    describe('clearSessionOverrides', () => {
        it('should clear overrides for specific chat', () => {
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.ALWAYS_ALLOW, 'chat-1');
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.DISABLED, 'chat-2');

            manager.clearSessionOverrides('chat-1');

            expect(manager.getConfirmationMode('myTool', 'chat-1')).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
            expect(manager.getConfirmationMode('myTool', 'chat-2')).to.equal(ToolConfirmationMode.DISABLED);
        });

        it('should clear all overrides when no chatId provided', () => {
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.ALWAYS_ALLOW, 'chat-1');
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.DISABLED, 'chat-2');

            manager.clearSessionOverrides();

            expect(manager.getConfirmationMode('myTool', 'chat-1')).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
            expect(manager.getConfirmationMode('myTool', 'chat-2')).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });
    });

    describe('confirmAlwaysAllow tools - "Always Approve" workflow', () => {
        it('should persist "Always Allow" for confirmAlwaysAllow tools', () => {
            const toolRequest = createToolRequest('shellExecute', 'This tool has full system access.');

            let mode = manager.getConfirmationMode('shellExecute', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);

            manager.setConfirmationMode('shellExecute', ToolConfirmationMode.ALWAYS_ALLOW, toolRequest);

            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPreferences['shellExecute']).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);

            mode = manager.getConfirmationMode('shellExecute', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('should persist "Disabled" for confirmAlwaysAllow tools', () => {
            const toolRequest = createToolRequest('shellExecute', true);

            manager.setConfirmationMode('shellExecute', ToolConfirmationMode.DISABLED, toolRequest);

            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPreferences['shellExecute']).to.equal(ToolConfirmationMode.DISABLED);

            const mode = manager.getConfirmationMode('shellExecute', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.DISABLED);
        });
    });
});
