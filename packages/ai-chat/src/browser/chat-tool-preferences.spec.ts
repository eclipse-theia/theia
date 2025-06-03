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
import * as sinon from 'sinon';
import { Container } from '@theia/core/shared/inversify';
import { PreferenceService } from '@theia/core/lib/browser/preferences';
import { ToolConfirmationMode, TOOL_CONFIRMATION_PREFERENCE, ChatToolPreferences, ToolConfirmationManager } from './chat-tool-preferences';

describe('ToolConfirmationManager', () => {
    let container: Container;
    let toolConfirmationManager: ToolConfirmationManager;
    let mockPreferenceService: PreferenceService;
    let mockChatToolPreferences: ChatToolPreferences;

    beforeEach(() => {
        container = new Container();

        // Mock preference service
        mockPreferenceService = {
            updateValue: sinon.stub(),
        } as any;

        // Mock chat tool preferences
        mockChatToolPreferences = {
            [TOOL_CONFIRMATION_PREFERENCE]: {}
        } as ChatToolPreferences;

        container.bind(ChatToolPreferences).toConstantValue(mockChatToolPreferences);
        container.bind(PreferenceService).toConstantValue(mockPreferenceService);
        container.bind(ToolConfirmationManager).toSelf();

        toolConfirmationManager = container.get(ToolConfirmationManager);
    });

    it('should return default confirmation mode (CONFIRM) for unknown tool', () => {
        const mode = toolConfirmationManager.getConfirmationMode('unknown-tool');
        expect(mode).to.equal(ToolConfirmationMode.CONFIRM);
    });

    it('should return configured confirmation mode for known tool', () => {
        mockChatToolPreferences[TOOL_CONFIRMATION_PREFERENCE] = {
            'test-tool': ToolConfirmationMode.YOLO
        };

        const mode = toolConfirmationManager.getConfirmationMode('test-tool');
        expect(mode).to.equal(ToolConfirmationMode.YOLO);
    });

    it('should set confirmation mode for a tool', () => {
        mockChatToolPreferences[TOOL_CONFIRMATION_PREFERENCE] = {
            'existing-tool': ToolConfirmationMode.CONFIRM
        };

        toolConfirmationManager.setConfirmationMode('new-tool', ToolConfirmationMode.DISABLED);

        const expectedSettings = {
            'existing-tool': ToolConfirmationMode.CONFIRM,
            'new-tool': ToolConfirmationMode.DISABLED
        };

        expect(mockPreferenceService.updateValue).to.have.been.calledWith(
            TOOL_CONFIRMATION_PREFERENCE,
            expectedSettings
        );
    });

    it('should update existing tool confirmation mode', () => {
        mockChatToolPreferences[TOOL_CONFIRMATION_PREFERENCE] = {
            'test-tool': ToolConfirmationMode.CONFIRM
        };

        toolConfirmationManager.setConfirmationMode('test-tool', ToolConfirmationMode.YOLO);

        const expectedSettings = {
            'test-tool': ToolConfirmationMode.YOLO
        };

        expect(mockPreferenceService.updateValue).to.have.been.calledWith(
            TOOL_CONFIRMATION_PREFERENCE,
            expectedSettings
        );
    });

    it('should return all confirmation settings', () => {
        const settings = {
            'tool1': ToolConfirmationMode.YOLO,
            'tool2': ToolConfirmationMode.CONFIRM,
            'tool3': ToolConfirmationMode.DISABLED
        };

        mockChatToolPreferences[TOOL_CONFIRMATION_PREFERENCE] = settings;

        const result = toolConfirmationManager.getAllConfirmationSettings();
        expect(result).to.deep.equal(settings);
    });

    it('should return empty object when no settings are configured', () => {
        mockChatToolPreferences[TOOL_CONFIRMATION_PREFERENCE] = {};

        const result = toolConfirmationManager.getAllConfirmationSettings();
        expect(result).to.deep.equal({});
    });

    describe('ToolConfirmationMode enum', () => {
        it('should have correct string values', () => {
            expect(ToolConfirmationMode.YOLO).to.equal('yolo');
            expect(ToolConfirmationMode.CONFIRM).to.equal('confirm');
            expect(ToolConfirmationMode.DISABLED).to.equal('disabled');
        });
    });
});