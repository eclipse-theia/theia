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

import { ConfirmDialog } from '@theia/core/lib/browser';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import { ToolInvocationRegistry } from '@theia/ai-core';
import { nls, PreferenceService } from '@theia/core';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { AITableConfigurationWidget, TableColumn } from './base/ai-table-configuration-widget';

const TOOL_OPTIONS: { value: ToolConfirmationMode, label: string, icon: string }[] = [
    { value: ToolConfirmationMode.DISABLED, label: nls.localizeByDefault('Disabled'), icon: 'close' },
    { value: ToolConfirmationMode.CONFIRM, label: nls.localize('theia/ai/ide/toolsConfiguration/toolOptions/confirm/label', 'Confirm'), icon: 'question' },
    { value: ToolConfirmationMode.ALWAYS_ALLOW, label: nls.localize('theia/ai/ide/toolsConfiguration/toolOptions/alwaysAllow/label', 'Always Allow'), icon: 'thumbsup' },
];

interface ToolItem {
    name: string;
}

@injectable()
export class AIToolsConfigurationWidget extends AITableConfigurationWidget<ToolItem> {
    static readonly ID = 'ai-tools-configuration-widget';
    static readonly LABEL = nls.localize('theia/ai/ide/toolsConfiguration/label', 'Tools');

    @inject(ToolConfirmationManager)
    protected readonly confirmationManager: ToolConfirmationManager;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    protected toolConfirmationModes: Record<string, ToolConfirmationMode> = {};
    protected defaultState: ToolConfirmationMode;

    @postConstruct()
    protected init(): void {
        this.id = AIToolsConfigurationWidget.ID;
        this.title.label = AIToolsConfigurationWidget.LABEL;
        this.title.closable = false;
        this.addClass('ai-configuration-widget');

        this.loadData().then(() => this.update());
        this.toDispose.pushAll([
            this.preferenceService.onPreferenceChanged(async e => {
                if (e.preferenceName === 'ai-features.chat.toolConfirmation') {
                    this.defaultState = await this.loadDefaultConfirmation();
                    this.toolConfirmationModes = await this.loadToolConfigurationModes();
                    this.update();
                }
            }),
            this.toolInvocationRegistry.onDidChange(async () => {
                await this.loadItems();
                this.update();
            })
        ]);
    }

    protected async loadData(): Promise<void> {
        await this.loadItems();
        this.defaultState = await this.loadDefaultConfirmation();
        this.toolConfirmationModes = await this.loadToolConfigurationModes();
    }

    protected async loadItems(): Promise<void> {
        const toolNames = this.toolInvocationRegistry.getAllFunctions().map(func => func.name);
        this.items = toolNames.map(name => ({ name }));
    }

    protected getItemId(item: ToolItem): string {
        return item.name;
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

    protected handleToolConfirmationModeChange = async (toolName: string, event: React.ChangeEvent<HTMLSelectElement>) => {
        const newState = event.target.value as ToolConfirmationMode;
        await this.updateToolConfirmationMode(toolName, newState);
    };
    protected handleDefaultStateChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newState = event.target.value as ToolConfirmationMode;
        await this.updateDefaultConfirmation(newState);
    };

    protected async resetAllToolsToDefault(): Promise<void> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/ide/toolsConfiguration/resetAllConfirmDialog/title', 'Reset All Tool Confirmation Modes'),
            msg: nls.localize('theia/ai/ide/toolsConfiguration/resetAllConfirmDialog/msg',
                'Are you sure you want to reset all tool confirmation modes to the default? This will remove all custom settings.'),
            ok: nls.localize('theia/ai/ide/toolsConfiguration/resetAll', 'Reset All'),
            cancel: nls.localizeByDefault('Cancel')
        });
        const shouldReset = await dialog.open();
        if (shouldReset) {
            this.confirmationManager.resetAllConfirmationModeSettings();
        }
    }

    protected override renderHeader(): React.ReactNode {
        return (
            <div className="ai-tools-configuration-header">
                <div style={{ fontWeight: 500 }}>
                    {nls.localize('theia/ai/ide/toolsConfiguration/default/label', 'Default Tool Confirmation Mode:')}
                </div>
                <select
                    className="theia-select"
                    value={this.defaultState}
                    onChange={this.handleDefaultStateChange}
                >
                    {TOOL_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <button
                    className='theia-button secondary ai-tools-reset-button'
                    style={{ marginLeft: 'auto' }}
                    title={nls.localize('theia/ai/ide/toolsConfiguration/resetAllTooltip', 'Reset all tools to default')}
                    onClick={() => this.resetAllToolsToDefault()}
                >
                    {nls.localize('theia/ai/ide/toolsConfiguration/resetAll', 'Reset All')}
                </button>
            </div>
        );
    }

    protected getColumns(): TableColumn<ToolItem>[] {
        return [
            {
                id: 'tool-name',
                label: nls.localize('theia/ai/ide/toolsConfiguration/tools/label', 'Tool'),
                className: 'tool-name-column',
                renderCell: (item: ToolItem) => <span>{item.name}</span>
            },
            {
                id: 'confirmation-mode',
                label: nls.localize('theia/ai/ide/toolsConfiguration/confirmationMode/label', 'Confirmation Mode'),
                className: 'confirmation-mode-column',
                renderCell: (item: ToolItem) => {
                    const state = this.toolConfirmationModes[item.name] || this.defaultState;
                    return (
                        <select
                            className="theia-select"
                            value={state}
                            onChange={e => this.handleToolConfirmationModeChange(item.name, e)}
                        >
                            {TOOL_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    );
                }
            }
        ];
    }

    protected override getRowClassName(item: ToolItem): string {
        const state = this.toolConfirmationModes[item.name] || this.defaultState;
        const isDefault = state === this.defaultState;
        return isDefault ? 'default-mode' : 'custom-mode';
    }
}
