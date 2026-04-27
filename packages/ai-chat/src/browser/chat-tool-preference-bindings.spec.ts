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
import { Container } from '@theia/core/shared/inversify';
import { ToolConfirmationManager } from './chat-tool-preference-bindings';
import { ToolConfirmationMode } from '../common/chat-tool-preferences';
import { ToolRequest } from '@theia/ai-core';
import { PreferenceService } from '@theia/core/lib/common/preferences';
import { TrustAwarePreferenceReader } from '@theia/ai-core/lib/browser/trust-aware-preference-reader';

describe('ToolConfirmationManager', () => {
    let manager: ToolConfirmationManager;
    let preferenceServiceMock: sinon.SinonStubbedInstance<PreferenceService>;
    let trustAwareReaderMock: sinon.SinonStubbedInstance<TrustAwarePreferenceReader>;
    let storedPreferences: { [toolId: string]: ToolConfirmationMode };
    let trusted: boolean;
    let inspectResult: {
        defaultValue?: { [toolId: string]: ToolConfirmationMode };
        globalValue?: { [toolId: string]: ToolConfirmationMode };
        workspaceValue?: { [toolId: string]: ToolConfirmationMode };
    } | undefined;

    const createToolRequest = (id: string, confirmAlwaysAllow?: boolean | string): ToolRequest => ({
        id,
        name: id,
        handler: async () => '',
        parameters: { type: 'object', properties: {} },
        confirmAlwaysAllow
    });

    beforeEach(() => {
        storedPreferences = {};
        trusted = true;
        inspectResult = undefined;

        preferenceServiceMock = {
            updateValue: sinon.stub().callsFake((_key: string, value: { [toolId: string]: ToolConfirmationMode }) => {
                storedPreferences = value;
                return Promise.resolve();
            }),
            inspect: sinon.stub().callsFake(() => inspectResult)
        } as unknown as sinon.SinonStubbedInstance<PreferenceService>;

        trustAwareReaderMock = {
            get: sinon.stub().callsFake(<T>(_name: string, fallback?: T): T | undefined => {
                if (trusted) {
                    return (storedPreferences as unknown as T) ?? fallback;
                }
                const insp = inspectResult;
                const value = insp?.globalValue ?? insp?.defaultValue;
                return ((value as unknown as T) ?? fallback);
            })
        } as unknown as sinon.SinonStubbedInstance<TrustAwarePreferenceReader>;

        const container = new Container();
        container.bind(ToolConfirmationManager).toSelf().inSingletonScope();
        container.bind(PreferenceService).toConstantValue(preferenceServiceMock as unknown as PreferenceService);
        container.bind(TrustAwarePreferenceReader).toConstantValue(trustAwareReaderMock as unknown as TrustAwarePreferenceReader);
        manager = container.get(ToolConfirmationManager);
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

    describe('workspace trust', () => {
        it('ignores workspace {"*": "always_allow"} when workspace is untrusted', () => {
            trusted = false;
            // Simulate the effective (workspace-merged) preference containing always_allow,
            // while the user/global scope is not set and the schema default prescribes
            // CONFIRM. If the workspace override were honoured the mode would be
            // ALWAYS_ALLOW; because trust filters the workspace scope out, the default
            // (CONFIRM) wins, which demonstrably proves the override was dropped.
            storedPreferences['*'] = ToolConfirmationMode.ALWAYS_ALLOW;
            inspectResult = {
                defaultValue: { '*': ToolConfirmationMode.CONFIRM },
                workspaceValue: { '*': ToolConfirmationMode.ALWAYS_ALLOW }
            };

            const mode = manager.getConfirmationMode('someTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('blocks confirmAlwaysAllow bypass via workspace {"*": "always_allow"} when untrusted', () => {
            trusted = false;
            storedPreferences['*'] = ToolConfirmationMode.ALWAYS_ALLOW;
            inspectResult = {
                defaultValue: {},
                workspaceValue: { '*': ToolConfirmationMode.ALWAYS_ALLOW }
            };

            const toolRequest = createToolRequest('dangerousTool', true);
            const mode = manager.getConfirmationMode('dangerousTool', 'chat-1', toolRequest);
            // Without the workspace value the map is empty, so the default for a
            // confirmAlwaysAllow tool (CONFIRM) is used.
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('honours workspace {"*": "always_allow"} when workspace is trusted', () => {
            trusted = true;
            storedPreferences['*'] = ToolConfirmationMode.ALWAYS_ALLOW;

            const mode = manager.getConfirmationMode('regularTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
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

        it('should not persist when mode matches the global preference default', () => {
            inspectResult = {
                defaultValue: { '*': ToolConfirmationMode.CONFIRM }
            };
            manager.setConfirmationMode('regularTool', ToolConfirmationMode.CONFIRM);
            expect(preferenceServiceMock.updateValue.called).to.be.false;
        });

        it('should persist when mode differs from the global preference default', () => {
            inspectResult = {
                defaultValue: { '*': ToolConfirmationMode.CONFIRM }
            };
            manager.setConfirmationMode('regularTool', ToolConfirmationMode.DISABLED);
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPreferences['regularTool']).to.equal(ToolConfirmationMode.DISABLED);
        });

        it('should not persist when mode matches the tool-specific preference default', () => {
            inspectResult = {
                defaultValue: { 'myTool': ToolConfirmationMode.DISABLED }
            };
            manager.setConfirmationMode('myTool', ToolConfirmationMode.DISABLED);
            expect(preferenceServiceMock.updateValue.called).to.be.false;
        });

        it('should remove entry when mode matches the tool-specific preference default and entry exists', () => {
            inspectResult = {
                defaultValue: { 'myTool': ToolConfirmationMode.DISABLED }
            };
            storedPreferences['myTool'] = ToolConfirmationMode.ALWAYS_ALLOW;
            manager.setConfirmationMode('myTool', ToolConfirmationMode.DISABLED);
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPreferences['myTool']).to.be.undefined;
        });

        it('should not persist CONFIRM for confirmAlwaysAllow tool when global preference default is CONFIRM', () => {
            inspectResult = {
                defaultValue: { '*': ToolConfirmationMode.CONFIRM }
            };
            const toolRequest = createToolRequest('dangerousTool', true);
            manager.setConfirmationMode('dangerousTool', ToolConfirmationMode.CONFIRM, toolRequest);
            expect(preferenceServiceMock.updateValue.called).to.be.false;
        });

        it('should persist ALWAYS_ALLOW for confirmAlwaysAllow tool when global preference default is CONFIRM', () => {
            inspectResult = {
                defaultValue: { '*': ToolConfirmationMode.CONFIRM }
            };
            const toolRequest = createToolRequest('dangerousTool', true);
            manager.setConfirmationMode('dangerousTool', ToolConfirmationMode.ALWAYS_ALLOW, toolRequest);
            expect(preferenceServiceMock.updateValue.calledOnce).to.be.true;
            expect(storedPreferences['dangerousTool']).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
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
