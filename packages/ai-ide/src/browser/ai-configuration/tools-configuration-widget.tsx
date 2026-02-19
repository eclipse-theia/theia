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
import { ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import { nls, PreferenceService } from '@theia/core';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import { ShellCommandPermissionService } from '@theia/ai-terminal/lib/browser/shell-command-permission-service';
import { ToolConfirmationMode } from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { SHELL_COMMAND_ALLOWLIST_PREFERENCE, SHELL_COMMAND_DENYLIST_PREFERENCE } from '@theia/ai-terminal/lib/common/shell-command-preferences';
import { AITableConfigurationWidget, TableColumn } from './base/ai-table-configuration-widget';

const TOOL_OPTIONS: { value: ToolConfirmationMode, label: string, icon: string }[] = [
    { value: ToolConfirmationMode.DISABLED, label: nls.localizeByDefault('Disabled'), icon: 'close' },
    { value: ToolConfirmationMode.CONFIRM, label: nls.localize('theia/ai/ide/toolsConfiguration/toolOptions/confirm/label', 'Confirm'), icon: 'question' },
    { value: ToolConfirmationMode.ALWAYS_ALLOW, label: nls.localizeByDefault('Always Allow'), icon: 'thumbsup' },
];

interface ToolItem {
    name: string;
}

@injectable()
export class AIToolsConfigurationWidget extends AITableConfigurationWidget<ToolItem> {
    static readonly ID = 'ai-tools-configuration-widget';
    static readonly LABEL = nls.localizeByDefault('Tools');

    @inject(ToolConfirmationManager)
    protected readonly confirmationManager: ToolConfirmationManager;

    @inject(PreferenceService)
    protected readonly preferenceService: PreferenceService;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    @inject(ShellCommandPermissionService)
    protected readonly shellCommandPermissionService: ShellCommandPermissionService;

    protected toolConfirmationModes: Record<string, ToolConfirmationMode> = {};
    protected defaultState: ToolConfirmationMode;
    protected allowlistPatterns: string[] = [];
    protected allowlistInputRef = React.createRef<HTMLInputElement>();
    protected allowlistError: string | undefined;
    protected denylistPatterns: string[] = [];
    protected denylistInputRef = React.createRef<HTMLInputElement>();
    protected denylistError: string | undefined;

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
                if (e.preferenceName === SHELL_COMMAND_ALLOWLIST_PREFERENCE) {
                    this.allowlistPatterns = this.shellCommandPermissionService.getAllowlistPatterns();
                    this.update();
                }
                if (e.preferenceName === SHELL_COMMAND_DENYLIST_PREFERENCE) {
                    this.denylistPatterns = this.shellCommandPermissionService.getDenylistPatterns();
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
        this.allowlistPatterns = this.shellCommandPermissionService.getAllowlistPatterns();
        this.denylistPatterns = this.shellCommandPermissionService.getDenylistPatterns();
    }

    protected async loadItems(): Promise<void> {
        const toolNames = this.toolInvocationRegistry.getAllFunctions()
            .map(func => func.name)
            .sort((a, b) => {
                const aIsMcp = a.startsWith('mcp_');
                const bIsMcp = b.startsWith('mcp_');
                if (aIsMcp !== bIsMcp) {
                    // Place names starting with "mcp_" after non-mcp names
                    return aIsMcp ? 1 : -1;
                }
                return a.localeCompare(b);
            });
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
    protected async updateToolConfirmationMode(tool: string, state: ToolConfirmationMode, toolRequest?: ToolRequest): Promise<void> {
        await this.confirmationManager.setConfirmationMode(tool, state, toolRequest);
    }
    protected async updateDefaultConfirmation(state: ToolConfirmationMode): Promise<void> {
        await this.confirmationManager.setConfirmationMode('*', state);
    }

    protected handleToolConfirmationModeChange = async (toolName: string, event: React.ChangeEvent<HTMLSelectElement>): Promise<void> => {
        const newState = event.target.value as ToolConfirmationMode;
        const toolRequest = this.toolInvocationRegistry.getFunction(toolName);

        // Check if we need extra confirmation for ALWAYS_ALLOW on confirmAlwaysAllow tools
        if (newState === ToolConfirmationMode.ALWAYS_ALLOW) {
            if (toolRequest?.confirmAlwaysAllow) {
                const confirmed = await this.showConfirmAlwaysAllowDialog(toolName, toolRequest);
                if (!confirmed) {
                    // Revert selection by triggering a re-render
                    this.update();
                    return;
                }
            }
        }

        await this.updateToolConfirmationMode(toolName, newState, toolRequest);
        // Reload from preferences to ensure consistency (setConfirmationMode may remove entries that match default)
        this.toolConfirmationModes = await this.loadToolConfigurationModes();
        this.update();
    };

    protected async showConfirmAlwaysAllowDialog(toolName: string, toolRequest: ToolRequest): Promise<boolean> {
        const warningMessage = typeof toolRequest.confirmAlwaysAllow === 'string'
            ? toolRequest.confirmAlwaysAllow
            : nls.localize(
                'theia/ai/ide/toolsConfiguration/confirmAlwaysAllow/genericWarning',
                'This tool requires confirmation before auto-approval can be enabled. ' +
                'Once enabled, all future invocations will execute without confirmation. ' +
                'Only enable this if you trust this tool and understand the potential risks.'
            );

        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/ide/toolsConfiguration/confirmAlwaysAllow/title', 'Enable Auto-Approval for "{0}"?', toolName),
            msg: warningMessage,
            ok: nls.localize('theia/ai/ide/toolsConfiguration/confirmAlwaysAllow/confirm', 'I understand, enable auto-approval'),
            cancel: nls.localizeByDefault('Cancel')
        });
        return !!await dialog.open();
    }
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

    protected getEffectiveState(toolName: string): ToolConfirmationMode {
        // If there's an explicit setting for this tool, use it
        const explicitSetting = this.toolConfirmationModes[toolName];
        if (explicitSetting !== undefined) {
            return explicitSetting;
        }
        // Otherwise, apply confirmAlwaysAllow logic to the default
        const toolRequest = this.toolInvocationRegistry.getFunction(toolName);
        if (toolRequest?.confirmAlwaysAllow && this.defaultState === ToolConfirmationMode.ALWAYS_ALLOW) {
            return ToolConfirmationMode.CONFIRM;
        }
        return this.defaultState;
    }

    protected getColumns(): TableColumn<ToolItem>[] {
        return [
            {
                id: 'tool-name',
                label: nls.localizeByDefault('Tool'),
                className: 'tool-name-column',
                renderCell: (item: ToolItem) => <span>{item.name}</span>
            },
            {
                id: 'confirmation-mode',
                label: nls.localize('theia/ai/ide/toolsConfiguration/confirmationMode/label', 'Confirmation Mode'),
                className: 'confirmation-mode-column',
                renderCell: (item: ToolItem) => {
                    const effectiveState = this.getEffectiveState(item.name);
                    return (
                        <select
                            className="theia-select"
                            value={effectiveState}
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
        const effectiveState = this.getEffectiveState(item.name);
        const isDefault = effectiveState === this.defaultState;
        return isDefault ? 'default-mode' : 'custom-mode';
    }

    protected handleAddAllowlistPattern(): void {
        this.handleAddPatternToList(
            this.allowlistInputRef,
            pattern => this.shellCommandPermissionService.addAllowlistPattern(pattern),
            () => this.shellCommandPermissionService.getAllowlistPatterns(),
            patterns => { this.allowlistPatterns = patterns; },
            error => { this.allowlistError = error; }
        );
    }

    protected handleRemoveAllowlistPattern(pattern: string): void {
        this.shellCommandPermissionService.removeAllowlistPattern(pattern);
    }

    protected handleAddDenylistPattern(): void {
        this.handleAddPatternToList(
            this.denylistInputRef,
            pattern => this.shellCommandPermissionService.addDenylistPattern(pattern),
            () => this.shellCommandPermissionService.getDenylistPatterns(),
            patterns => { this.denylistPatterns = patterns; },
            error => { this.denylistError = error; }
        );
    }

    protected handleRemoveDenylistPattern(pattern: string): void {
        this.shellCommandPermissionService.removeDenylistPattern(pattern);
    }

    protected handleAddPatternToList(
        inputRef: React.RefObject<HTMLInputElement>,
        addFn: (pattern: string) => void,
        getFn: () => string[],
        setPatterns: (patterns: string[]) => void,
        setError: (error: string | undefined) => void
    ): void {
        const input = inputRef.current;
        if (!input) {
            return;
        }

        const trimmed = input.value.trim();
        if (trimmed.length === 0) {
            return;
        }

        try {
            addFn(trimmed);
            input.value = '';
            setError(undefined);
            setPatterns(getFn());
            this.update();
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Invalid pattern');
            this.update();
        }
    }

    protected override renderFooter(): React.ReactNode {
        return (
            <>
                <div className="ai-shell-permission-list-section">
                    <div className="settings-section-title settings-section-category-title">
                        {nls.localize('theia/ai/ide/toolsConfiguration/shellAllowlist/title', 'Shell Execute Allowlist')}
                    </div>
                    <p className="ai-shell-permission-list-description">
                        {nls.localize(
                            'theia/ai/ide/toolsConfiguration/shellAllowlist/description',
                            'Commands matching these patterns will be automatically allowed without confirmation. ' +
                            'Use * as wildcard: "git log" (exact match), "git log *" (with any arguments). ' +
                            'Wildcard must be preceded by a space.'
                        )}
                    </p>
                    <div className="ai-shell-permission-list-input-row">
                        <input
                            ref={this.allowlistInputRef}
                            type="text"
                            className="theia-input"
                            placeholder={nls.localize(
                                'theia/ai/ide/shellAllowlist/placeholder',
                                'e.g., "git log" (exact) or "git log *" (with args)'
                            )}
                            onKeyDown={e => e.key === 'Enter' && this.handleAddAllowlistPattern()}
                        />
                        <button className="theia-button main" onClick={() => this.handleAddAllowlistPattern()}>
                            {nls.localizeByDefault('Add')}
                        </button>
                    </div>
                    {this.allowlistError && (
                        <p className="ai-shell-permission-list-error">
                            {this.allowlistError}
                        </p>
                    )}
                    <ul className="ai-shell-permission-list-patterns">
                        {this.allowlistPatterns.map(pattern => (
                            <li key={pattern} className="ai-shell-permission-list-pattern-item">
                                <code>{pattern}</code>
                                <button
                                    className="theia-button secondary"
                                    onClick={() => this.handleRemoveAllowlistPattern(pattern)}
                                >
                                    {nls.localizeByDefault('Remove')}
                                </button>
                            </li>
                        ))}
                    </ul>
                    {this.allowlistPatterns.length === 0 && (
                        <p className="ai-shell-permission-list-empty">
                            {nls.localize(
                                'theia/ai/ide/toolsConfiguration/shellAllowlist/empty',
                                'No patterns configured. All shell commands will require confirmation.'
                            )}
                        </p>
                    )}
                </div>
                <div className="ai-shell-permission-list-section">
                    <div className="settings-section-title settings-section-category-title">
                        {nls.localize('theia/ai/ide/toolsConfiguration/shellDenylist/title', 'Shell Execute Denylist')}
                    </div>
                    <p className="ai-shell-permission-list-description">
                        {nls.localize(
                            'theia/ai/ide/toolsConfiguration/shellDenylist/description',
                            'Commands matching these patterns will be automatically denied without confirmation. ' +
                            "Use this to block dangerous commands like 'git push *' or 'rm -rf /'."
                        )}
                    </p>
                    <div className="ai-shell-permission-list-input-row">
                        <input
                            ref={this.denylistInputRef}
                            type="text"
                            className="theia-input"
                            placeholder={nls.localize(
                                'theia/ai/ide/shellDenylist/placeholder',
                                'e.g., "git push *" or "rm -rf /"'
                            )}
                            onKeyDown={e => e.key === 'Enter' && this.handleAddDenylistPattern()}
                        />
                        <button className="theia-button main" onClick={() => this.handleAddDenylistPattern()}>
                            {nls.localizeByDefault('Add')}
                        </button>
                    </div>
                    {this.denylistError && (
                        <p className="ai-shell-permission-list-error">
                            {this.denylistError}
                        </p>
                    )}
                    <ul className="ai-shell-permission-list-patterns">
                        {this.denylistPatterns.map(pattern => (
                            <li key={pattern} className="ai-shell-permission-list-pattern-item">
                                <code>{pattern}</code>
                                <button
                                    className="theia-button secondary"
                                    onClick={() => this.handleRemoveDenylistPattern(pattern)}
                                >
                                    {nls.localizeByDefault('Remove')}
                                </button>
                            </li>
                        ))}
                    </ul>
                    {this.denylistPatterns.length === 0 && (
                        <p className="ai-shell-permission-list-empty">
                            {nls.localize(
                                'theia/ai/ide/toolsConfiguration/shellDenylist/empty',
                                'No patterns configured. No shell commands will be automatically denied.'
                            )}
                        </p>
                    )}
                </div>
            </>
        );
    }

}
