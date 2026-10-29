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
import {
    DEFAULT_TOOL_CONFIRMATION_PREFERENCE,
    TOOL_CONFIRMATION_PREFERENCE,
    ToolConfirmationMode
} from '../common/chat-tool-preferences';
import { AiConfigurationService, ToolRequest } from '@theia/ai-core';
import { JSONValue } from '@theia/core/shared/@lumino/coreutils';
import { PreferenceInspection, PreferenceUtils } from '@theia/core/lib/common/preferences';

interface InspectResult<T> {
    defaultValue?: T;
    globalValue?: T;
    workspaceValue?: T;
}

describe('ToolConfirmationManager', () => {
    let manager: ToolConfirmationManager;
    let aiConfigurationServiceMock: sinon.SinonStubbedInstance<AiConfigurationService>;
    let storedPerToolPreferences: { [toolId: string]: ToolConfirmationMode };
    let storedDefaultMode: ToolConfirmationMode | undefined;
    let trusted: boolean;
    let perToolInspectResult: InspectResult<{ [toolId: string]: ToolConfirmationMode }> | undefined;
    let defaultInspectResult: InspectResult<ToolConfirmationMode> | undefined;

    const createToolRequest = (id: string, confirmAlwaysAllow?: boolean | string): ToolRequest => ({
        id,
        name: id,
        handler: async () => '',
        parameters: { type: 'object', properties: {} },
        confirmAlwaysAllow
    });

    beforeEach(() => {
        storedPerToolPreferences = {};
        storedDefaultMode = undefined;
        trusted = true;
        perToolInspectResult = undefined;
        defaultInspectResult = undefined;

        // The manager talks only to AiConfigurationService. `get` mirrors the trust-aware read
        // semantics, `update` the smart write, and `inspect` exposes schema defaults.
        aiConfigurationServiceMock = {
            get: sinon.stub().callsFake(<T>(name: string, fallback?: T): T | undefined => {
                if (name === TOOL_CONFIRMATION_PREFERENCE) {
                    if (trusted) {
                        return (storedPerToolPreferences as unknown as T) ?? fallback;
                    }
                    const value = perToolInspectResult?.globalValue ?? perToolInspectResult?.defaultValue;
                    return ((value as unknown as T) ?? fallback);
                }
                if (name === DEFAULT_TOOL_CONFIRMATION_PREFERENCE) {
                    if (trusted) {
                        return (storedDefaultMode as unknown as T) ?? fallback;
                    }
                    const value = defaultInspectResult?.globalValue ?? defaultInspectResult?.defaultValue;
                    return ((value as unknown as T) ?? fallback);
                }
                return fallback;
            }),
            update: sinon.stub().callsFake((key: string, value: unknown) => {
                if (key === TOOL_CONFIRMATION_PREFERENCE) {
                    storedPerToolPreferences = value as { [toolId: string]: ToolConfirmationMode };
                } else if (key === DEFAULT_TOOL_CONFIRMATION_PREFERENCE) {
                    storedDefaultMode = value as ToolConfirmationMode;
                }
                return Promise.resolve();
            }),
            inspect: sinon.stub().callsFake((name: string) => {
                if (name === TOOL_CONFIRMATION_PREFERENCE) {
                    // While trusted, the stored record is the user value that `get` returns.
                    return trusted ? { ...perToolInspectResult, globalValue: storedPerToolPreferences } : perToolInspectResult;
                }
                if (name === DEFAULT_TOOL_CONFIRMATION_PREFERENCE) {
                    return defaultInspectResult;
                }
                return undefined;
            })
        } as unknown as sinon.SinonStubbedInstance<AiConfigurationService>;

        const container = new Container();
        container.bind(ToolConfirmationManager).toSelf().inSingletonScope();
        container.bind(AiConfigurationService).toConstantValue(aiConfigurationServiceMock as unknown as AiConfigurationService);
        manager = container.get(ToolConfirmationManager);
    });

    describe('getDefaultConfirmationMode', () => {
        it('returns CONFIRM when nothing is set', () => {
            expect(manager.getDefaultConfirmationMode()).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('returns the value stored in the user preference', () => {
            storedDefaultMode = ToolConfirmationMode.ALWAYS_ALLOW;
            expect(manager.getDefaultConfirmationMode()).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('falls back to the schema-level default when no user value is set', () => {
            defaultInspectResult = { defaultValue: ToolConfirmationMode.DISABLED };
            expect(manager.getDefaultConfirmationMode()).to.equal(ToolConfirmationMode.DISABLED);
        });
    });

    describe('setDefaultConfirmationMode', () => {
        it('persists the new default through the preference service', () => {
            manager.setDefaultConfirmationMode(ToolConfirmationMode.ALWAYS_ALLOW);
            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(aiConfigurationServiceMock.update.firstCall.args[0]).to.equal(DEFAULT_TOOL_CONFIRMATION_PREFERENCE);
            expect(aiConfigurationServiceMock.update.firstCall.args[1]).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
            expect(storedDefaultMode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });
    });

    describe('getConfirmationMode', () => {
        it('returns CONFIRM for regular tools by default', () => {
            const mode = manager.getConfirmationMode('regularTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('returns CONFIRM for confirmAlwaysAllow tools by default', () => {
            const toolRequest = createToolRequest('dangerousTool', true);
            const mode = manager.getConfirmationMode('dangerousTool', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('returns the global default for regular tools when set', () => {
            storedDefaultMode = ToolConfirmationMode.ALWAYS_ALLOW;
            const mode = manager.getConfirmationMode('regularTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('returns tool-specific preference when set', () => {
            storedPerToolPreferences['myTool'] = ToolConfirmationMode.DISABLED;
            const mode = manager.getConfirmationMode('myTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.DISABLED);
        });

        it('returns session override when set', () => {
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.ALWAYS_ALLOW, 'chat-1');
            const mode = manager.getConfirmationMode('myTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('does not inherit global ALWAYS_ALLOW for confirmAlwaysAllow tools', () => {
            storedDefaultMode = ToolConfirmationMode.ALWAYS_ALLOW;
            const toolRequest = createToolRequest('dangerousTool', true);
            const mode = manager.getConfirmationMode('dangerousTool', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('inherits global DISABLED for confirmAlwaysAllow tools', () => {
            storedDefaultMode = ToolConfirmationMode.DISABLED;
            const toolRequest = createToolRequest('dangerousTool', true);
            const mode = manager.getConfirmationMode('dangerousTool', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.DISABLED);
        });

        it('respects an explicit per-tool ALWAYS_ALLOW for confirmAlwaysAllow tools', () => {
            storedPerToolPreferences['dangerousTool'] = ToolConfirmationMode.ALWAYS_ALLOW;
            const toolRequest = createToolRequest('dangerousTool', true);
            const mode = manager.getConfirmationMode('dangerousTool', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });
    });

    describe('workspace trust', () => {
        it('ignores a workspace-scoped default of ALWAYS_ALLOW when workspace is untrusted', () => {
            trusted = false;
            // Simulate the effective (workspace-merged) default being ALWAYS_ALLOW while
            // the user/global scope is unset and the schema default is CONFIRM. With trust
            // disabled the workspace value must be dropped, so CONFIRM wins.
            storedDefaultMode = ToolConfirmationMode.ALWAYS_ALLOW;
            defaultInspectResult = {
                defaultValue: ToolConfirmationMode.CONFIRM,
                workspaceValue: ToolConfirmationMode.ALWAYS_ALLOW
            };

            const mode = manager.getConfirmationMode('someTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('blocks confirmAlwaysAllow bypass via workspace ALWAYS_ALLOW default when untrusted', () => {
            trusted = false;
            storedDefaultMode = ToolConfirmationMode.ALWAYS_ALLOW;
            defaultInspectResult = {
                workspaceValue: ToolConfirmationMode.ALWAYS_ALLOW
            };

            const toolRequest = createToolRequest('dangerousTool', true);
            const mode = manager.getConfirmationMode('dangerousTool', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('honours a workspace-scoped ALWAYS_ALLOW default when workspace is trusted', () => {
            trusted = true;
            storedDefaultMode = ToolConfirmationMode.ALWAYS_ALLOW;

            const mode = manager.getConfirmationMode('regularTool', 'chat-1');
            expect(mode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });
    });

    describe('setConfirmationMode', () => {
        it('persists ALWAYS_ALLOW for a regular tool when default is CONFIRM', () => {
            manager.setConfirmationMode('regularTool', ToolConfirmationMode.ALWAYS_ALLOW);
            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(storedPerToolPreferences['regularTool']).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('persists ALWAYS_ALLOW for confirmAlwaysAllow tools', () => {
            const toolRequest = createToolRequest('dangerousTool', true);
            manager.setConfirmationMode('dangerousTool', ToolConfirmationMode.ALWAYS_ALLOW, toolRequest);
            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(storedPerToolPreferences['dangerousTool']).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('does not persist when mode matches the global default', () => {
            storedDefaultMode = ToolConfirmationMode.ALWAYS_ALLOW;
            manager.setConfirmationMode('regularTool', ToolConfirmationMode.ALWAYS_ALLOW);
            expect(aiConfigurationServiceMock.update.called).to.be.false;
        });

        it('does not persist CONFIRM for a regular tool when default is CONFIRM', () => {
            manager.setConfirmationMode('regularTool', ToolConfirmationMode.CONFIRM);
            expect(aiConfigurationServiceMock.update.called).to.be.false;
        });

        it('persists DISABLED when default is CONFIRM', () => {
            manager.setConfirmationMode('regularTool', ToolConfirmationMode.DISABLED);
            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(storedPerToolPreferences['regularTool']).to.equal(ToolConfirmationMode.DISABLED);
        });

        it('does not persist when mode matches a tool-specific schema default', () => {
            perToolInspectResult = {
                defaultValue: { 'myTool': ToolConfirmationMode.DISABLED }
            };
            manager.setConfirmationMode('myTool', ToolConfirmationMode.DISABLED);
            expect(aiConfigurationServiceMock.update.called).to.be.false;
        });

        it('removes an existing entry when mode matches the tool-specific schema default', () => {
            perToolInspectResult = {
                defaultValue: { 'myTool': ToolConfirmationMode.DISABLED }
            };
            storedPerToolPreferences['myTool'] = ToolConfirmationMode.ALWAYS_ALLOW;
            manager.setConfirmationMode('myTool', ToolConfirmationMode.DISABLED);
            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(storedPerToolPreferences['myTool']).to.be.undefined;
        });

        it('does not persist CONFIRM for confirmAlwaysAllow tools (matches effective default)', () => {
            const toolRequest = createToolRequest('dangerousTool', true);
            manager.setConfirmationMode('dangerousTool', ToolConfirmationMode.CONFIRM, toolRequest);
            expect(aiConfigurationServiceMock.update.called).to.be.false;
        });

        it('persists ALWAYS_ALLOW for a confirmAlwaysAllow tool when global default is ALWAYS_ALLOW', () => {
            // The effective default for confirmAlwaysAllow tools is CONFIRM even when
            // the global default is ALWAYS_ALLOW, so ALWAYS_ALLOW must still be persisted.
            storedDefaultMode = ToolConfirmationMode.ALWAYS_ALLOW;
            const toolRequest = createToolRequest('dangerousTool', true);
            manager.setConfirmationMode('dangerousTool', ToolConfirmationMode.ALWAYS_ALLOW, toolRequest);
            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(storedPerToolPreferences['dangerousTool']).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('removes an existing entry when setting CONFIRM for a confirmAlwaysAllow tool', () => {
            const toolRequest = createToolRequest('dangerousTool', true);
            storedPerToolPreferences['dangerousTool'] = ToolConfirmationMode.ALWAYS_ALLOW;
            manager.setConfirmationMode('dangerousTool', ToolConfirmationMode.CONFIRM, toolRequest);
            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(storedPerToolPreferences['dangerousTool']).to.be.undefined;
        });

        it('persists DISABLED for any tool when default is CONFIRM', () => {
            manager.setConfirmationMode('anyTool', ToolConfirmationMode.DISABLED);
            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(storedPerToolPreferences['anyTool']).to.equal(ToolConfirmationMode.DISABLED);
        });
    });

    describe('setSessionConfirmationMode', () => {
        it('sets a session override for a specific chat', () => {
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.ALWAYS_ALLOW, 'chat-1');
            expect(manager.getConfirmationMode('myTool', 'chat-1')).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
            expect(manager.getConfirmationMode('myTool', 'chat-2')).to.equal(ToolConfirmationMode.CONFIRM);
        });

        it('prioritizes session override over persisted preference', () => {
            storedPerToolPreferences['myTool'] = ToolConfirmationMode.DISABLED;
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.ALWAYS_ALLOW, 'chat-1');
            expect(manager.getConfirmationMode('myTool', 'chat-1')).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });
    });

    describe('clearSessionOverrides', () => {
        it('clears overrides for a specific chat', () => {
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.ALWAYS_ALLOW, 'chat-1');
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.DISABLED, 'chat-2');

            manager.clearSessionOverrides('chat-1');

            expect(manager.getConfirmationMode('myTool', 'chat-1')).to.equal(ToolConfirmationMode.CONFIRM);
            expect(manager.getConfirmationMode('myTool', 'chat-2')).to.equal(ToolConfirmationMode.DISABLED);
        });

        it('clears all overrides when no chatId is given', () => {
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.ALWAYS_ALLOW, 'chat-1');
            manager.setSessionConfirmationMode('myTool', ToolConfirmationMode.DISABLED, 'chat-2');

            manager.clearSessionOverrides();

            expect(manager.getConfirmationMode('myTool', 'chat-1')).to.equal(ToolConfirmationMode.CONFIRM);
            expect(manager.getConfirmationMode('myTool', 'chat-2')).to.equal(ToolConfirmationMode.CONFIRM);
        });
    });

    describe('getAllConfirmationSettings', () => {
        it('returns the per-tool record from the trust-aware reader', () => {
            storedPerToolPreferences['toolA'] = ToolConfirmationMode.ALWAYS_ALLOW;
            storedPerToolPreferences['toolB'] = ToolConfirmationMode.DISABLED;

            const settings = manager.getAllConfirmationSettings();

            expect(settings).to.deep.equal({
                toolA: ToolConfirmationMode.ALWAYS_ALLOW,
                toolB: ToolConfirmationMode.DISABLED
            });
        });

        it('returns an empty record when no tool-specific entries are configured', () => {
            const settings = manager.getAllConfirmationSettings();
            expect(settings).to.deep.equal({});
        });
    });

    describe('resetAllConfirmationModeSettings', () => {
        it('clears all per-tool entries', () => {
            storedPerToolPreferences['toolA'] = ToolConfirmationMode.ALWAYS_ALLOW;
            storedPerToolPreferences['toolB'] = ToolConfirmationMode.DISABLED;

            manager.resetAllConfirmationModeSettings();

            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(aiConfigurationServiceMock.update.firstCall.args[0]).to.equal(TOOL_CONFIRMATION_PREFERENCE);
            expect(aiConfigurationServiceMock.update.firstCall.args[1]).to.deep.equal({});
        });

        it('does not modify the default-confirmation preference', () => {
            storedDefaultMode = ToolConfirmationMode.ALWAYS_ALLOW;
            storedPerToolPreferences['toolA'] = ToolConfirmationMode.DISABLED;

            manager.resetAllConfirmationModeSettings();

            expect(storedDefaultMode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });
    });

    describe('confirmAlwaysAllow tools - "Always Approve" workflow', () => {
        it('persists "Always Allow" for confirmAlwaysAllow tools', () => {
            const toolRequest = createToolRequest('shellExecute', 'This tool has full system access.');

            let mode = manager.getConfirmationMode('shellExecute', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.CONFIRM);

            manager.setConfirmationMode('shellExecute', ToolConfirmationMode.ALWAYS_ALLOW, toolRequest);

            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(storedPerToolPreferences['shellExecute']).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);

            mode = manager.getConfirmationMode('shellExecute', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('persists "Disabled" for confirmAlwaysAllow tools', () => {
            const toolRequest = createToolRequest('shellExecute', true);

            manager.setConfirmationMode('shellExecute', ToolConfirmationMode.DISABLED, toolRequest);

            expect(aiConfigurationServiceMock.update.calledOnce).to.be.true;
            expect(storedPerToolPreferences['shellExecute']).to.equal(ToolConfirmationMode.DISABLED);

            const mode = manager.getConfirmationMode('shellExecute', 'chat-1', toolRequest);
            expect(mode).to.equal(ToolConfirmationMode.DISABLED);
        });
    });

    describe('with a value set for this session', () => {
        /**
         * Default, User and Session values for each key, resolved as `AiConfigurationService` resolves them in a
         * trusted workspace with no workspace values: `get` merges objects across the scopes, and `update` writes
         * User scope and clears the session value unless the value is unchanged.
         */
        class ScopedConfiguration {
            readonly defaults = new Map<string, JSONValue>([
                [TOOL_CONFIRMATION_PREFERENCE, {}],
                [DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ToolConfirmationMode.CONFIRM]
            ]);
            readonly user = new Map<string, JSONValue>();
            readonly session = new Map<string, JSONValue>();
            readonly ready = Promise.resolve();

            get<T>(key: string, fallback?: T): T | undefined {
                let value: JSONValue | undefined;
                for (const scope of [this.defaults, this.user, this.session]) {
                    if (scope.has(key)) {
                        value = PreferenceUtils.merge(value, scope.get(key)!);
                    }
                }
                return (value as T | undefined) ?? fallback;
            }

            inspect(key: string): PreferenceInspection<JSONValue> {
                const defaultValue = this.defaults.get(key);
                const globalValue = this.user.get(key);
                const sessionValue = this.session.get(key);
                return {
                    preferenceName: key, defaultValue, globalValue, workspaceValue: undefined, workspaceFolderValue: undefined, sessionValue,
                    value: sessionValue ?? globalValue ?? defaultValue
                };
            }

            update(key: string, value: JSONValue): Promise<void> {
                // Like `updateValue`, write nothing when the value equals the one of the highest scope that sets it.
                if (!PreferenceUtils.deepEqual(this.inspect(key).value, value)) {
                    this.user.set(key, value);
                    this.session.delete(key);
                }
                return Promise.resolve();
            }
        }

        let configuration: ScopedConfiguration;

        beforeEach(() => {
            configuration = new ScopedConfiguration();
            const container = new Container();
            container.bind(ToolConfirmationManager).toSelf().inSingletonScope();
            container.bind(AiConfigurationService).toConstantValue(configuration as unknown as AiConfigurationService);
            manager = container.get(ToolConfirmationManager);
            configuration.user.set(TOOL_CONFIRMATION_PREFERENCE, { getFileContent: ToolConfirmationMode.DISABLED });
            configuration.session.set(TOOL_CONFIRMATION_PREFERENCE, { shellExecute: ToolConfirmationMode.ALWAYS_ALLOW });
        });

        it('setConfirmationMode doesn\'t save the session value to the user settings', async () => {
            await manager.setConfirmationMode('writeFileContent', ToolConfirmationMode.DISABLED);

            expect(configuration.user.get(TOOL_CONFIRMATION_PREFERENCE)).to.deep.equal({
                getFileContent: ToolConfirmationMode.DISABLED,
                writeFileContent: ToolConfirmationMode.DISABLED
            });
        });

        it('setConfirmationModes doesn\'t save the session value to the user settings', async () => {
            await manager.setConfirmationModes([
                { toolId: 'writeFileContent', mode: ToolConfirmationMode.DISABLED },
                { toolId: 'getFileContent', mode: ToolConfirmationMode.CONFIRM }
            ]);

            expect(configuration.user.get(TOOL_CONFIRMATION_PREFERENCE)).to.deep.equal({ writeFileContent: ToolConfirmationMode.DISABLED });
        });

        it('setConfirmationMode resets a tool without saving the session value to the user settings', async () => {
            await manager.setConfirmationMode('getFileContent', ToolConfirmationMode.CONFIRM);

            expect(configuration.user.get(TOOL_CONFIRMATION_PREFERENCE)).to.deep.equal({});
        });

        it('setConfirmationMode resets a tool that only the session value sets', async () => {
            await manager.setConfirmationMode('shellExecute', ToolConfirmationMode.CONFIRM);

            expect(manager.getConfirmationMode('shellExecute', 'chat-1')).to.equal(ToolConfirmationMode.CONFIRM);
            expect(configuration.user.get(TOOL_CONFIRMATION_PREFERENCE)).to.deep.equal({ getFileContent: ToolConfirmationMode.DISABLED });
        });

        it('setConfirmationModes resets a tool that only the session value sets', async () => {
            await manager.setConfirmationModes([{ toolId: 'shellExecute', mode: ToolConfirmationMode.CONFIRM }]);

            expect(manager.getConfirmationMode('shellExecute', 'chat-1')).to.equal(ToolConfirmationMode.CONFIRM);
            expect(configuration.user.get(TOOL_CONFIRMATION_PREFERENCE)).to.deep.equal({ getFileContent: ToolConfirmationMode.DISABLED });
        });

        it('setConfirmationModes applies a mode that only the session value overrides', async () => {
            configuration.user.set(TOOL_CONFIRMATION_PREFERENCE, { shellExecute: ToolConfirmationMode.ALWAYS_ALLOW });
            configuration.session.set(TOOL_CONFIRMATION_PREFERENCE, { shellExecute: ToolConfirmationMode.DISABLED });

            await manager.setConfirmationModes([{ toolId: 'shellExecute', mode: ToolConfirmationMode.ALWAYS_ALLOW }]);

            expect(manager.getConfirmationMode('shellExecute', 'chat-1')).to.equal(ToolConfirmationMode.ALWAYS_ALLOW);
        });

        it('setConfirmationModes saves a mode that the session value already sets', async () => {
            await manager.setConfirmationModes([{ toolId: 'shellExecute', mode: ToolConfirmationMode.ALWAYS_ALLOW }]);

            expect(configuration.user.get(TOOL_CONFIRMATION_PREFERENCE)).to.deep.equal({
                getFileContent: ToolConfirmationMode.DISABLED,
                shellExecute: ToolConfirmationMode.ALWAYS_ALLOW
            });
        });
    });
});
