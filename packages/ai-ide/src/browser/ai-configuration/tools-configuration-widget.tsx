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

import { PreferenceService, ReactWidget, ConfirmDialog } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ToolConfirmationManager, ToolConfirmationMode } from '@theia/ai-chat/lib/browser/chat-tool-preferences';
import { ToolInvocationRegistry } from '@theia/ai-core';

const TOOL_OPTIONS: { value: ToolConfirmationMode, label: string, icon: string }[] = [
    { value: ToolConfirmationMode.DISABLED, label: 'Disabled', icon: 'close' },
    { value: ToolConfirmationMode.CONFIRM, label: 'Confirm', icon: 'question' },
    { value: ToolConfirmationMode.ALWAYS_ALLOW, label: 'Always Allow', icon: 'thumbsup' },
];

@injectable()
export class AIToolsConfigurationWidget extends ReactWidget {
    static readonly ID = 'ai-tools-configuration-widget';
    static readonly LABEL = 'Tools';

    @inject(ToolConfirmationManager)
    protected readonly confirmationManager: ToolConfirmationManager;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    // Mocked tool list and state
    protected tools: string[] = [];
    protected toolConfirmationModes: Record<string, ToolConfirmationMode> = {};
    protected defaultState: ToolConfirmationMode;
    protected loading = true;

    @postConstruct()
    protected init(): void {
        this.id = AIToolsConfigurationWidget.ID;
        this.title.label = AIToolsConfigurationWidget.LABEL;
        this.title.closable = false;
        this.loadData();
        this.update();
        this.toDispose.pushAll([
            this.preferenceService.onPreferenceChanged(async e => {
                if (e.preferenceName === 'ai-features.chat.toolConfirmation') {
                    this.defaultState = await this.loadDefaultConfirmation();
                    this.toolConfirmationModes = await this.loadToolConfigurationModes();
                    this.update();
                }
            }),
            this.toolInvocationRegistry.onDidChange(async () => {
                this.tools = await this.loadTools();
                this.update();
            })
        ]);
    }

    protected async loadData(): Promise<void> {
        // Replace with real service calls
        this.tools = await this.loadTools();
        this.defaultState = await this.loadDefaultConfirmation();
        this.toolConfirmationModes = await this.loadToolConfigurationModes();
        this.loading = false;
        this.update();
    }

    protected async loadTools(): Promise<string[]> {
        return this.toolInvocationRegistry.getAllFunctions().map(func => func.name);
    }
    protected async loadDefaultConfirmation(): Promise<ToolConfirmationMode> {
        return this.confirmationManager.getConfirmationMode('*', 'doesNotMatter');
    }
    protected async loadToolConfigurationModes(): Promise<Record<string, ToolConfirmationMode>> {
        return this.confirmationManager.getAllConfirmationSettings();
    }
    protected async updateToolConfirmationMode(tool: string, state: ToolConfirmationMode): Promise<void> {
        await this.confirmationManager.setConfirmationMode(tool, state);
    }
    protected async updateDefaultConfirmation(state: ToolConfirmationMode): Promise<void> {
        await this.confirmationManager.setConfirmationMode('*', state);
    }

    protected handleToolConfirmationModeChange = async (tool: string, event: React.ChangeEvent<HTMLSelectElement>) => {
        const newState = event.target.value as ToolConfirmationMode;
        await this.updateToolConfirmationMode(tool, newState);
    };
    protected handleDefaultStateChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newState = event.target.value as ToolConfirmationMode;
        await this.updateDefaultConfirmation(newState);
    };

    protected async resetAllToolsToDefault(): Promise<void> {
        const dialog = new ConfirmDialog({
            title: 'Reset All Tool Confirmation Modes',
            msg: 'Are you sure you want to reset all tool confirmation modes to the default? This will remove all custom settings.',
            ok: 'Reset All',
            cancel: 'Cancel'
        });
        const shouldReset = await dialog.open();
        if (shouldReset) {
            this.confirmationManager.resetAllConfirmationModeSettings();
        }
    }

    protected render(): React.ReactNode {
        if (this.loading) {
            return <div>Loading tools...</div>;
        }
        return <div className='ai-tools-configuration-container'>
            <div className='ai-tools-configuration-default-section' style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div className='ai-tools-configuration-default-label'>Default Tool Confirmation Mode:</div>
                <select
                    className="ai-tools-configuration-default-select"
                    value={this.defaultState}
                    onChange={this.handleDefaultStateChange}
                    style={{ marginLeft: 8 }}
                >
                    {TOOL_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <button
                    className='ai-tools-configuration-reset-btn'
                    style={{ marginLeft: 'auto' }}
                    title='Reset all tools to default'
                    onClick={() => this.resetAllToolsToDefault()}
                >
                    Reset All
                </button>
            </div>
            <div className='ai-tools-configuration-tools-section'>
                <div className='ai-tools-configuration-tools-label'>Tools</div>
                <ul className='ai-tools-configuration-tools-list'>
                    {this.tools.map(tool => {
                        const state = this.toolConfirmationModes[tool] || this.defaultState;
                        const isDefault = state === this.defaultState;
                        const selectClass = 'ai-tools-configuration-tool-select';
                        return (
                            <li
                                key={tool}
                                className={
                                    'ai-tools-configuration-tool-item ' +
                                    (isDefault ? 'default' : 'custom')
                                }
                            >
                                <span className='ai-tools-configuration-tool-name'>{tool}</span>
                                <select
                                    className={selectClass}
                                    value={state}
                                    onChange={e => this.handleToolConfirmationModeChange(tool, e)}
                                >
                                    {TOOL_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                            </li>
                        );
                    })}
                </ul>
            </div>
        </div>;
    }
}
