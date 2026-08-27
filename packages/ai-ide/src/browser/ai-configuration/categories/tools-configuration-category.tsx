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

import { AiConfigurationService, ToolInvocationRegistry, ToolRequest } from '@theia/ai-core';
import { ToolConfirmationManager } from '@theia/ai-chat/lib/browser/chat-tool-preference-bindings';
import {
    DEFAULT_TOOL_CONFIRMATION_PREFERENCE,
    TOOL_CONFIRMATION_MODE_DESCRIPTIONS,
    TOOL_CONFIRMATION_MODE_VALUES,
    TOOL_CONFIRMATION_PREFERENCE,
    ToolConfirmationMode
} from '@theia/ai-chat/lib/common/chat-tool-preferences';
import { SHELL_COMMAND_ALLOWLIST_PREFERENCE, SHELL_COMMAND_DENYLIST_PREFERENCE } from '@theia/ai-terminal/lib/common/shell-command-preferences';
import { ShellCommandPermissionService } from '@theia/ai-terminal/lib/browser/shell-command-permission-service';
import { Emitter, Event, nls } from '@theia/core';
import { codicon, ConfirmDialog } from '@theia/core/lib/browser';
import { DisposableCollection } from '@theia/core/lib/common';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import * as React from '@theia/core/shared/react';
import {
    AiConfigurationCategory,
    AiConfigurationCategoryId,
    AiConfigurationCategoryOrder,
    AiConfigurationRenderContext,
    AiConfigurationSearchItem,
    AiConfigurationSearchProvider,
    AiConfigurationTools
} from '@theia/ai-core-ui/lib/browser/ai-configuration/ai-configuration-category';
import { SinglePageCategoryRenderer } from '@theia/ai-core-ui/lib/browser/ai-configuration/renderers/single-page-category-renderer';
import {
    AiConfigurationCallout,
    AiConfigurationFilterInput,
    AiConfigurationSection
} from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-primitives';
import { AiEnumSelect } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-controls';
import { AiConfigurationItemRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-item-row';
import { AiConfigurationSettingRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-configuration-setting-row';
import { AiSettingsRow } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row';
import { AiSettingsControl, AiSettingsRowService } from '@theia/ai-core-ui/lib/browser/ai-configuration/components/ai-settings-row-service';

// UI labels for the modes (the schema has no `enumItemLabels`); the values and per-option descriptions
// come straight from the preference definition so the descriptions are not duplicated here.
const TOOL_OPTION_LABELS: Record<ToolConfirmationMode, string> = {
    [ToolConfirmationMode.DISABLED]: nls.localizeByDefault('Disabled'),
    [ToolConfirmationMode.CONFIRM]: nls.localize('theia/ai/ide/toolsConfiguration/toolOptions/confirm/label', 'Confirm'),
    [ToolConfirmationMode.ALWAYS_ALLOW]: nls.localizeByDefault('Always Allow')
};

const TOOL_OPTIONS: { value: ToolConfirmationMode; label: string; title: string }[] = TOOL_CONFIRMATION_MODE_VALUES.map((value, index) => ({
    value,
    label: TOOL_OPTION_LABELS[value],
    title: TOOL_CONFIRMATION_MODE_DESCRIPTIONS[index]
}));

/**
 * The Tools category: a `single-page` category with the default confirmation mode, a per-tool
 * confirmation table, the recommended-defaults banner, and the shell allow/deny-list editors.
 */
@injectable()
export class ToolsConfigurationCategory extends SinglePageCategoryRenderer implements AiConfigurationCategory, AiConfigurationSearchProvider {

    readonly id = AiConfigurationCategoryId.TOOLS;
    readonly label = nls.localizeByDefault('Tools');
    readonly description = nls.localize('theia/ai/ide/toolsConfiguration/description',
        'Choose which tools agents may call and whether each one needs confirmation before it runs.');
    readonly iconClass = codicon('tools');
    readonly order = AiConfigurationCategoryOrder.TOOLS;
    readonly kind = 'single-page' as const;

    @inject(ToolConfirmationManager)
    protected readonly confirmationManager: ToolConfirmationManager;

    @inject(ToolInvocationRegistry)
    protected readonly toolInvocationRegistry: ToolInvocationRegistry;

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected readonly toDispose = new DisposableCollection(this.onDidChangeEmitter);

    protected toolNames: string[] = [];
    protected toolConfirmationModes: Record<string, ToolConfirmationMode> = {};
    protected defaultState: ToolConfirmationMode = ToolConfirmationMode.CONFIRM;

    get renderer(): this {
        return this;
    }

    getOwnedPreferenceIds(): string[] {
        // Managed via the confirmation-mode selector/table and the shell allow/deny editors on this page.
        return [
            DEFAULT_TOOL_CONFIRMATION_PREFERENCE,
            TOOL_CONFIRMATION_PREFERENCE,
            SHELL_COMMAND_ALLOWLIST_PREFERENCE,
            SHELL_COMMAND_DENYLIST_PREFERENCE
        ];
    }

    get search(): AiConfigurationSearchProvider {
        return this;
    }

    @inject(AiConfigurationService)
    protected readonly aiConfigurationService: AiConfigurationService;

    @inject(AiSettingsRowService)
    protected readonly settingsRowService: AiSettingsRowService;

    @inject(ShellCommandPermissionService)
    protected readonly shellCommandPermissionService: ShellCommandPermissionService;

    protected readonly renderMarkdown = (markdown: string): HTMLElement => this.settingsRowService.renderMarkdown(markdown);

    @postConstruct()
    protected init(): void {
        this.load();
        this.toDispose.pushAll([
            this.toolInvocationRegistry.onDidChange(() => {
                this.loadTools();
                this.onDidChangeEmitter.fire();
            }),
            this.aiConfigurationService.onDidChange(async event => {
                if (event.affectsPreference(TOOL_CONFIRMATION_PREFERENCE) || event.affectsPreference(DEFAULT_TOOL_CONFIRMATION_PREFERENCE)) {
                    await this.loadConfirmation();
                    this.onDidChangeEmitter.fire();
                }
                if (event.affectsPreference(SHELL_COMMAND_ALLOWLIST_PREFERENCE) || event.affectsPreference(SHELL_COMMAND_DENYLIST_PREFERENCE)) {
                    this.onDidChangeEmitter.fire();
                }
            })
        ]);
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    protected async load(): Promise<void> {
        this.loadTools();
        await this.loadConfirmation();
        this.onDidChangeEmitter.fire();
    }

    protected loadTools(): void {
        this.toolNames = this.toolInvocationRegistry.getAllFunctions()
            .map(func => func.name)
            .sort((a, b) => {
                const aIsMcp = a.startsWith('mcp_');
                const bIsMcp = b.startsWith('mcp_');
                if (aIsMcp !== bIsMcp) {
                    return aIsMcp ? 1 : -1;
                }
                return a.localeCompare(b);
            });
    }

    protected async loadConfirmation(): Promise<void> {
        this.defaultState = this.confirmationManager.getDefaultConfirmationMode();
        this.toolConfirmationModes = this.confirmationManager.getAllConfirmationSettings();
    }

    protected getEffectiveState(toolName: string): ToolConfirmationMode {
        const explicit = this.toolConfirmationModes[toolName];
        if (explicit !== undefined) {
            return explicit;
        }
        const toolRequest = this.toolInvocationRegistry.getFunction(toolName);
        if (toolRequest?.confirmAlwaysAllow && this.defaultState === ToolConfirmationMode.ALWAYS_ALLOW) {
            return ToolConfirmationMode.CONFIRM;
        }
        return this.defaultState;
    }

    /** Title of the default-confirmation-mode row, shared by the header and the search index. */
    protected defaultModeLabel(): string {
        return this.settingsRowService.describe(DEFAULT_TOOL_CONFIRMATION_PREFERENCE).label
            ?? nls.localize('theia/ai/ide/toolsConfiguration/default/rowLabel', 'Default Tool Confirmation Mode');
    }

    protected override renderHeader(ctx: AiConfigurationRenderContext): React.ReactNode {
        const described = this.settingsRowService.describe(DEFAULT_TOOL_CONFIRMATION_PREFERENCE);
        const inspection = this.settingsRowService.inspect(DEFAULT_TOOL_CONFIRMATION_PREFERENCE, ctx.scope);
        const modeLabel = this.defaultModeLabel();
        return <div className='ai-configuration-page'>
            {/* Rendered as a normal setting row (id/title/description + control below), plus a page-level
                "Reset All" action in the row's action slot. */}
            <AiConfigurationSettingRow
                preferenceId={DEFAULT_TOOL_CONFIRMATION_PREFERENCE}
                title={modeLabel}
                description={described.description}
                renderMarkdown={this.renderMarkdown}
                modified={inspection.modified}
                tags={this.settingsRowService.tags(DEFAULT_TOOL_CONFIRMATION_PREFERENCE)}
                onOpenMenu={gear => this.settingsRowService.openSettingContextMenu(gear, DEFAULT_TOOL_CONFIRMATION_PREFERENCE, inspection.value, ctx.scope)}
                below={<AiEnumSelect
                    ariaLabel={modeLabel}
                    value={this.defaultState}
                    options={TOOL_OPTIONS}
                    onCommit={value => this.confirmationManager.setDefaultConfirmationMode(value as ToolConfirmationMode)}
                />}
                actions={<button
                    className='theia-button secondary'
                    title={nls.localize('theia/ai/ide/toolsConfiguration/resetAllTooltip', 'Reset all tools to default')}
                    onClick={() => this.resetAllToolsToDefault()}
                >
                    {nls.localize('theia/ai/ide/toolsConfiguration/resetAll', 'Reset All')}
                </button>}
            />
            {this.renderRecommendedDefaultsBanner()}
        </div>;
    }

    protected renderRecommendedDefaultsBanner(): React.ReactNode {
        if (this.defaultState !== ToolConfirmationMode.CONFIRM) {
            return undefined;
        }
        return <AiConfigurationCallout
            message={nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/message',
                'Tool calls currently require approval. Auto-allow all built-in tools at once.'
                + ' Tools that require extra confirmation (e.g. shell execution), MCP tools,'
                + ' and any tools added later will still ask before running.')}
            action={<button className='theia-button main' onClick={() => this.allowCurrentTools()}>
                {nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/apply', 'Allow Default Tools')}
            </button>}
        />;
    }

    protected renderSections(ctx: AiConfigurationRenderContext): React.ReactNode {
        return <div className='ai-configuration-page'>
            <ToolConfirmationTable
                toolNames={this.toolNames}
                getDescription={name => this.toolInvocationRegistry.getFunction(name)?.description}
                getEffectiveState={name => this.getEffectiveState(name)}
                isModified={name => this.toolConfirmationModes[name] !== undefined}
                onChangeMode={(name, value) => this.handleToolConfirmationModeChange(name, value)}
            />
            {/* The allow/deny lists are plain `string[]` preferences, rendered as normal setting rows with the
                shared list editor rather than a bespoke add/remove control. Entries are checked by
                `ShellCommandPermissionService` first: this is the only GUI for these patterns, and an
                unchecked one silently misbehaves ("*" would auto-approve everything, "git log*" would also
                match "git logfoo"). The row still writes the preference itself, so it keeps honouring the
                page's scope; only the rules come from the service. */}
            <AiConfigurationSection title={nls.localize('theia/ai/ide/toolsConfiguration/shellExecution', 'Shell Command Execution')}>
                <AiSettingsRow
                    service={this.settingsRowService}
                    preferenceId={SHELL_COMMAND_ALLOWLIST_PREFERENCE}
                    scope={ctx.scope}
                    control={this.shellPatternControl(SHELL_COMMAND_ALLOWLIST_PREFERENCE)}
                    onDidChange={ctx.update}
                />
                <AiSettingsRow
                    service={this.settingsRowService}
                    preferenceId={SHELL_COMMAND_DENYLIST_PREFERENCE}
                    scope={ctx.scope}
                    control={this.shellPatternControl(SHELL_COMMAND_DENYLIST_PREFERENCE)}
                    onDidChange={ctx.update}
                />
            </AiConfigurationSection>
        </div>;
    }

    protected async handleToolConfirmationModeChange(toolName: string, mode: ToolConfirmationMode): Promise<void> {
        const toolRequest = this.toolInvocationRegistry.getFunction(toolName);
        if (mode === ToolConfirmationMode.ALWAYS_ALLOW && toolRequest?.confirmAlwaysAllow) {
            const confirmed = await this.showConfirmAlwaysAllowDialog(toolName, toolRequest);
            if (!confirmed) {
                this.onDidChangeEmitter.fire();
                return;
            }
        }
        await this.confirmationManager.setConfirmationMode(toolName, mode, toolRequest);
    }

    protected async showConfirmAlwaysAllowDialog(toolName: string, toolRequest: ToolRequest): Promise<boolean> {
        const warningMessage = typeof toolRequest.confirmAlwaysAllow === 'string'
            ? toolRequest.confirmAlwaysAllow
            : nls.localize('theia/ai/ide/toolsConfiguration/confirmAlwaysAllow/genericWarning',
                'This tool requires confirmation before auto-approval can be enabled. '
                + 'Once enabled, all future invocations will execute without confirmation. '
                + 'Only enable this if you trust this tool and understand the potential risks.');
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/ide/toolsConfiguration/confirmAlwaysAllow/title', 'Enable Auto-Approval for "{0}"?', toolName),
            msg: warningMessage,
            ok: nls.localize('theia/ai/ide/toolsConfiguration/confirmAlwaysAllow/confirm', 'I understand, enable auto-approval'),
            cancel: nls.localizeByDefault('Cancel')
        });
        return !!await dialog.open();
    }

    protected async resetAllToolsToDefault(): Promise<void> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/ide/toolsConfiguration/resetAllConfirmDialog/title', 'Reset All Tool Confirmation Modes'),
            msg: nls.localize('theia/ai/ide/toolsConfiguration/resetAllConfirmDialog/msg',
                'Are you sure you want to reset all tool confirmation modes to the default? This will remove all custom settings.'),
            ok: nls.localize('theia/ai/ide/toolsConfiguration/resetAll', 'Reset All'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (await dialog.open()) {
            await this.confirmationManager.resetAllConfirmationModeSettings();
        }
    }

    protected async allowCurrentTools(): Promise<void> {
        const dialog = new ConfirmDialog({
            title: nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/dialogTitle', 'Allow Default Tools?'),
            msg: this.buildAllowCurrentToolsMessage(),
            ok: nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/dialogConfirm', 'I understand, allow'),
            cancel: nls.localizeByDefault('Cancel')
        });
        if (!await dialog.open()) {
            return;
        }
        const updates: Array<{ toolId: string; mode: ToolConfirmationMode; toolRequest: ToolRequest }> = [];
        for (const tool of this.toolInvocationRegistry.getAllFunctions()) {
            if (tool.confirmAlwaysAllow || tool.name.startsWith('mcp_') || this.toolConfirmationModes[tool.name] === ToolConfirmationMode.DISABLED) {
                continue;
            }
            updates.push({ toolId: tool.name, mode: ToolConfirmationMode.ALWAYS_ALLOW, toolRequest: tool });
        }
        await this.confirmationManager.setConfirmationModes(updates);
    }

    protected buildAllowCurrentToolsMessage(): HTMLElement {
        const container = document.createElement('div');
        const lines = [
            nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/msg/line1', 'This sets all currently registered built-in tools to "Always Allow".'),
            nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/msg/line2',
                'Tools that require extra confirmation (such as shell execution) will still ask before running.'),
            nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/msg/line3',
                'MCP tools are third-party and are not included. You can allow them individually in this view.'),
            nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/msg/line4', 'Tools added later will still default to "Confirm" so you can review them.'),
            nls.localize('theia/ai/ide/toolsConfiguration/recommendedDefaults/msg/line5', 'You can change this later in this view.')
        ];
        for (const line of lines) {
            const paragraph = document.createElement('p');
            paragraph.textContent = line;
            container.appendChild(paragraph);
        }
        return container;
    }

    /**
     * The list control for a shell command pattern list, with the service's own rules attached so an invalid
     * pattern is refused with its message instead of being written.
     */
    protected shellPatternControl(preferenceId: string): AiSettingsControl {
        const control = this.settingsRowService.controlFor(preferenceId);
        if (control.type !== 'array') {
            return control;
        }
        return { ...control, validate: pattern => this.shellCommandPermissionService.checkPattern(pattern) };
    }

    getSearchItems(): AiConfigurationSearchItem[] {
        const toolTypeLabel = nls.localizeByDefault('Tool');
        const items: AiConfigurationSearchItem[] = [{
            label: this.defaultModeLabel(),
            typeLabel: nls.localizeByDefault('Setting'),
            categoryId: this.id,
            target: { categoryId: this.id },
            keywords: `${DEFAULT_TOOL_CONFIRMATION_PREFERENCE} ${TOOL_CONFIRMATION_PREFERENCE} ${SHELL_COMMAND_ALLOWLIST_PREFERENCE} ${SHELL_COMMAND_DENYLIST_PREFERENCE}`
        }];
        for (const name of this.toolNames) {
            items.push({ label: name, typeLabel: toolTypeLabel, categoryId: this.id, target: AiConfigurationTools.selectionFor(name), keywords: name });
        }
        return items;
    }
}

/**
 * The per-tool confirmation-mode list with a reusable filter above it. The filter is local UI state, so
 * typing narrows the (potentially long) tool list without touching any preference. Each tool is a
 * non-navigable {@link AiConfigurationItemRow} whose trailing control is its confirmation-mode select,
 * so the list matches the Skills / Variables list style.
 */
const ToolConfirmationTable: React.FC<{
    toolNames: string[];
    getDescription: (name: string) => string | undefined;
    getEffectiveState: (name: string) => ToolConfirmationMode;
    isModified: (name: string) => boolean;
    onChangeMode: (name: string, value: ToolConfirmationMode) => void;
}> = ({ toolNames, getDescription, getEffectiveState, isModified, onChangeMode }) => {
    const [filter, setFilter] = React.useState('');
    const term = filter.trim().toLowerCase();
    const filtered = term ? toolNames.filter(name => name.toLowerCase().includes(term)) : toolNames;
    const modeLabel = nls.localize('theia/ai/ide/toolsConfiguration/confirmationMode/label', 'Confirmation Mode');
    return <>
        <AiConfigurationFilterInput
            value={filter}
            onChange={setFilter}
            placeholder={nls.localize('theia/ai/ide/toolsConfiguration/filterPlaceholder', 'Filter tools')}
        />
        <div className='ai-configuration-item-list'>
            {filtered.map(name => <AiConfigurationItemRow
                key={name}
                rowId={AiConfigurationTools.ROW_ID_PREFIX + name}
                label={name}
                description={getDescription(name)}
                modified={isModified(name)}
                trailing={<AiEnumSelect
                    ariaLabel={modeLabel}
                    value={getEffectiveState(name)}
                    options={TOOL_OPTIONS}
                    onCommit={value => onChangeMode(name, value as ToolConfirmationMode)}
                />}
            />)}
        </div>
    </>;
};
