// *****************************************************************************
// Copyright (C) 2022 Ericsson and others.
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

import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { codicon, QuickInputService, QuickPickItem, StatusBar, StatusBarAlignment, StatusBarEntry } from '@theia/core/lib/browser';
import { LanguageService } from '@theia/core/lib/browser/language-service';
import { CommandRegistry, DisposableCollection, nls, PreferenceScope } from '@theia/core';
import { TextEditor } from '../editor';
import { EditorCommands } from '../editor-command';
import { LanguageSelector, score } from '../../common/language-selector';
import { AccessibilityInformation } from '@theia/core/lib/common/accessibility';
import URI from '@theia/core/lib/common/uri';
import { CurrentEditorAccess } from '../editor-manager';
import { Severity } from '@theia/core/lib/common/severity';
import { LabelParser } from '@theia/core/lib/browser/label-parser';
import { FormatterService, FormatterSettingScope, FormatterStatus } from '../editor-formatter-service';

/**
 * Represents the severity of a language status item.
 */
export enum LanguageStatusSeverity {
    Information = 0,
    Warning = 1,
    Error = 2
}

interface ScopeDisplayInfo {
    icon: string;
    text: string;
}

const SCOPE_DISPLAY_MAP: Record<FormatterSettingScope, () => ScopeDisplayInfo> = {
    user: () => ({
        icon: '$(account)',
        text: nls.localizeByDefault('User Settings')
    }),
    workspace: () => ({
        icon: '$(folder)',
        text: nls.localizeByDefault('Workspace Settings')
    }),
    auto: () => ({
        icon: '$(check)',
        text: nls.localize('theia/editor/onlyAvailableFormatter', 'Only Available Formatter')
    }),
    none: () => ({
        icon: '$(question)',
        text: nls.localizeByDefault('Unknown')
    })
};

function getScopeDisplayInfo(scope: FormatterSettingScope): ScopeDisplayInfo {
    return SCOPE_DISPLAY_MAP[scope]();
}

interface FormatterDisplayInfo {
    text: string;
    tooltip: string;
    clickable: boolean;
}

/**
 * Command represents a particular invocation of a registered command.
 */
export interface Command {
    /**
     * The identifier of the actual command handler.
     */
    id: string;
    /**
     * Title of the command invocation, like "Add local variable 'foo'".
     */
    title?: string;
    /**
     * A tooltip for for command, when represented in the UI.
     */
    tooltip?: string;
    /**
     * Arguments that the command handler should be
     * invoked with.
     */
    arguments?: unknown[];
}

/**
 * A language status item is the preferred way to present language status reports for the active text editors,
 * such as selected linter or notifying about a configuration problem.
 */
export interface LanguageStatus {
    readonly id: string;
    readonly name: string;
    readonly selector: LanguageSelector;
    readonly severity: Severity;
    readonly label: string;
    readonly detail: string;
    readonly busy: boolean;
    readonly source: string;
    readonly command: Command | undefined;
    readonly accessibilityInfo: AccessibilityInformation | undefined;
}

@injectable()
export class EditorLanguageStatusService {
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(LanguageService) protected readonly languages: LanguageService;
    @inject(CurrentEditorAccess) protected readonly editorAccess: CurrentEditorAccess;
    @inject(CommandRegistry) protected readonly commandRegistry: CommandRegistry;
    @inject(LabelParser) protected readonly labelParser: LabelParser;
    @inject(FormatterService) @optional() protected readonly formatterService: FormatterService | undefined;
    @inject(QuickInputService) @optional() protected readonly quickInputService: QuickInputService | undefined;

    protected static LANGUAGE_MODE_ID = 'editor-status-language';
    protected static LANGUAGE_STATUS_ID = 'editor-language-status-items';
    protected static FORMATTER_STATUS_ID = 'editor-status-formatter';

    protected readonly status = new Map<number, LanguageStatus>();
    protected pinnedCommands = new Set<string>();
    protected readonly toDisposeOnEditorChange = new DisposableCollection();

    setLanguageStatusItem(handle: number, item: LanguageStatus): void {
        this.status.set(handle, item);
        this.updateLanguageStatusItems();
    }

    removeLanguageStatusItem(handle: number): void {
        this.status.delete(handle);
        this.updateLanguageStatusItems();
    }

    updateLanguageStatus(editor: TextEditor | undefined): void {
        this.toDisposeOnEditorChange.dispose();

        if (!editor) {
            this.statusBar.removeElement(EditorLanguageStatusService.LANGUAGE_MODE_ID);
            this.statusBar.removeElement(EditorLanguageStatusService.FORMATTER_STATUS_ID);
            return;
        }
        const language = this.languages.getLanguage(editor.document.languageId);
        const languageName = language ? language.name : '';
        this.statusBar.setElement(EditorLanguageStatusService.LANGUAGE_MODE_ID, {
            text: languageName,
            alignment: StatusBarAlignment.RIGHT,
            priority: 1,
            command: EditorCommands.CHANGE_LANGUAGE.id,
            tooltip: nls.localizeByDefault('Select Language Mode')
        });
        this.updateLanguageStatusItems(editor);
        this.updateFormatterStatus(editor);

        this.toDisposeOnEditorChange.push(
            editor.onLanguageChanged(() => this.updateFormatterStatus(editor))
        );

        if (this.formatterService) {
            this.toDisposeOnEditorChange.push(
                this.formatterService.onDidChangeFormatters(() => this.updateFormatterStatus(editor))
            );
        }
    }

    protected updateFormatterStatus(editor: TextEditor | undefined): void {
        if (!editor || !this.formatterService) {
            this.statusBar.removeElement(EditorLanguageStatusService.FORMATTER_STATUS_ID);
            return;
        }

        const status = this.formatterService.getFormatterStatus(editor);
        const availableFormatters = this.formatterService.getAvailableFormatters(editor);
        const displayInfo = this.buildFormatterStatusDisplay(status, availableFormatters);

        this.statusBar.setElement(EditorLanguageStatusService.FORMATTER_STATUS_ID, {
            text: displayInfo.text,
            alignment: StatusBarAlignment.RIGHT,
            priority: 0.5,
            tooltip: displayInfo.tooltip,
            onclick: displayInfo.clickable ? () => this.showFormatterQuickPick(editor) : undefined
        });
    }

    protected buildFormatterStatusDisplay(
        status: FormatterStatus,
        availableFormatters: ReturnType<FormatterService['getAvailableFormatters']>
    ): FormatterDisplayInfo {
        const formatterCount = availableFormatters.length;
        if (formatterCount === 0) {
            return this.buildZeroFormattersDisplay(status);
        }
        if (formatterCount === 1) {
            return this.buildSingleFormatterDisplay(status, availableFormatters);
        }
        return this.buildMultipleFormattersDisplay(status, formatterCount);
    }

    protected buildZeroFormattersDisplay(status: FormatterStatus): FormatterDisplayInfo {
        if (status.configuredFormatterId) {
            const scopeInfo = getScopeDisplayInfo(status.scope);
            return {
                text: `$(error) ${status.configuredFormatterId}`,
                tooltip: nls.localize(
                    'theia/editor/formatterSelectedNotInstalled',
                    "'{0}' is configured in {1} but is not installed.",
                    status.configuredFormatterId,
                    scopeInfo.text
                ),
                clickable: false
            };
        }
        return {
            text: nls.localize('theia/editor/noFormattersInstalled', 'No Formatters Installed'),
            tooltip: nls.localize('theia/editor/noFormattersInstalledTooltip', 'No formatters are installed for this language.'),
            clickable: false
        };
    }

    protected buildSingleFormatterDisplay(status: FormatterStatus, availableFormatters?: ReturnType<FormatterService['getAvailableFormatters']>): FormatterDisplayInfo {
        const activeFormatter = status.formatter ?? availableFormatters?.[0];
        if (!activeFormatter) {
            return this.buildZeroFormattersDisplay(status);
        }

        const baseTooltip = nls.localize(
            'theia/editor/formatterActiveOnlyOne',
            "'{0}' is active because it is the only formatter installed.",
            activeFormatter.displayName
        );

        if (status.isInvalid && status.configuredFormatterId) {
            const scopeInfo = getScopeDisplayInfo(status.scope);
            return {
                text: `$(warning) ${activeFormatter.displayName}`,
                tooltip: `${baseTooltip} ${nls.localize(
                    'theia/editor/formatterConfiguredNotInstalled',
                    "'{0}' is configured in {1} but is not installed. Click to select the active formatter.",
                    status.configuredFormatterId,
                    scopeInfo.text
                )}`,
                clickable: true
            };
        }

        return {
            text: `$(check) ${activeFormatter.displayName}`,
            tooltip: baseTooltip,
            clickable: false
        };
    }

    protected buildMultipleFormattersDisplay(status: FormatterStatus, formatterCount: number): FormatterDisplayInfo {
        const clickToSelect = nls.localize('theia/editor/clickToSelectFormatter', 'Click to select a formatter.');

        if (status.isInvalid && status.configuredFormatterId) {
            const scopeInfo = getScopeDisplayInfo(status.scope);
            return {
                text: `$(error) ${status.configuredFormatterId}`,
                tooltip: `${nls.localize(
                    'theia/editor/formatterSelectedNotInstalled',
                    "'{0}' is configured in {1} but is not installed.",
                    status.configuredFormatterId,
                    scopeInfo.text
                )} ${clickToSelect}`,
                clickable: true
            };
        }

        if (status.formatter) {
            const scopeInfo = getScopeDisplayInfo(status.scope);
            return {
                text: `${scopeInfo.icon} ${status.formatter.displayName}`,
                tooltip: `${nls.localize(
                    'theia/editor/formatterTooltip',
                    'Formatter: {0} ({1})',
                    status.formatter.displayName,
                    scopeInfo.text
                )} ${clickToSelect}`,
                clickable: true
            };
        }

        return {
            text: nls.localize('theia/editor/formattersAvailable', '{0} Formatters installed', formatterCount),
            tooltip: `${nls.localize(
                'theia/editor/formattersInstalledTooltip',
                '{0} formatters are installed for this language.',
                formatterCount
            )} ${clickToSelect}`,
            clickable: true
        };
    }

    protected async showFormatterQuickPick(editor: TextEditor): Promise<void> {
        if (!this.formatterService || !this.quickInputService) {
            return;
        }

        const formatters = this.formatterService.getAvailableFormatters(editor);

        if (formatters.length === 0) {
            await this.quickInputService.showQuickPick(
                [{ label: nls.localize('theia/editor/noFormattersAvailable', 'No formatters available for this language') }],
                { placeholder: nls.localize('theia/editor/selectFormatter', 'Select Default Formatter') }
            );
            return;
        }

        const selectedFormatter = await this.showFormatterSelectionPick(editor, formatters);
        if (selectedFormatter === undefined) {
            return;
        }

        const targetScope = await this.determineTargetScope(editor);
        if (targetScope === undefined) {
            return;
        }

        const formatterId = selectedFormatter.id === '' ? undefined : selectedFormatter.id;
        await this.formatterService.setDefaultFormatter(editor, formatterId, targetScope);
    }

    protected async showFormatterSelectionPick(
        editor: TextEditor,
        formatters: ReturnType<FormatterService['getAvailableFormatters']>
    ): Promise<QuickPickItem | undefined> {
        const status = this.formatterService!.getFormatterStatus(editor);
        const currentFormatterId = status.formatter?.id;
        const currentLabel = nls.localize('theia/editor/currentFormatter', '(Current)');

        const formatterItems: QuickPickItem[] = formatters.map(formatter => ({
            label: formatter.displayName,
            description: formatter.id === currentFormatterId ? currentLabel : undefined,
            detail: formatter.id,
            id: formatter.id
        }));

        const noneItem: QuickPickItem = {
            label: nls.localizeByDefault('None'),
            description: !currentFormatterId ? currentLabel : undefined,
            detail: nls.localize('theia/editor/clearFormatterSetting', 'Clear formatter setting'),
            id: ''
        };

        return this.quickInputService!.showQuickPick(
            [noneItem, ...formatterItems],
            { placeholder: nls.localize('theia/editor/selectFormatter', 'Select Default Formatter') }
        );
    }

    protected async determineTargetScope(editor: TextEditor): Promise<PreferenceScope | undefined> {
        const currentScope = this.formatterService!.getConfiguredScope(editor);

        if (currentScope === PreferenceScope.Folder) {
            return PreferenceScope.Folder;
        }

        if (currentScope === PreferenceScope.Workspace) {
            return PreferenceScope.Workspace;
        }

        if (currentScope === PreferenceScope.User) {
            return this.showScopeSelectionPick();
        }

        return this.showScopeSelectionPick();
    }

    protected async showScopeSelectionPick(): Promise<PreferenceScope | undefined> {
        const userScopeInfo = getScopeDisplayInfo('user');
        const workspaceScopeInfo = getScopeDisplayInfo('workspace');

        const scopeItems: (QuickPickItem & { value: PreferenceScope })[] = [
            {
                label: `${userScopeInfo.icon} ${userScopeInfo.text}`,
                detail: nls.localize('theia/editor/userSettingsDetail', 'Apply to all workspaces'),
                value: PreferenceScope.User
            },
            {
                label: `${workspaceScopeInfo.icon} ${workspaceScopeInfo.text}`,
                detail: nls.localize('theia/editor/workspaceSettingsDetail', 'Apply to current workspace only'),
                value: PreferenceScope.Workspace
            }
        ];

        const result = await this.quickInputService!.showQuickPick(
            scopeItems,
            { placeholder: nls.localize('theia/editor/selectScope', 'Select where to save the setting') }
        );

        return result?.value;
    }

    protected updateLanguageStatusItems(editor = this.editorAccess.editor): void {
        if (!editor) {
            this.statusBar.removeElement(EditorLanguageStatusService.LANGUAGE_STATUS_ID);
            this.updatePinnedItems();
            return;
        }
        const uri = new URI(editor.document.uri);
        const items = Array.from(this.status.values())
            .filter(item => score(item.selector, uri.scheme, uri.path.toString(), editor.document.languageId, true))
            .sort((left, right) => right.severity - left.severity);
        if (!items.length) {
            this.statusBar.removeElement(EditorLanguageStatusService.LANGUAGE_STATUS_ID);
            return;
        }
        const severityText = items[0].severity === Severity.Info
            ? '$(bracket)'
            : items[0].severity === Severity.Warning
                ? '$(bracket-dot)'
                : '$(bracket-error)';
        this.statusBar.setElement(EditorLanguageStatusService.LANGUAGE_STATUS_ID, {
            text: severityText,
            alignment: StatusBarAlignment.RIGHT,
            priority: 2,
            tooltip: this.createTooltip(items),
            affinity: { id: EditorLanguageStatusService.LANGUAGE_MODE_ID, alignment: StatusBarAlignment.LEFT, compact: true },
        });
        this.updatePinnedItems(items);
    }

    protected updatePinnedItems(items?: LanguageStatus[]): void {
        const toRemoveFromStatusBar = new Set(this.pinnedCommands);
        items?.forEach(item => {
            if (toRemoveFromStatusBar.has(item.id)) {
                toRemoveFromStatusBar.delete(item.id);
                this.statusBar.setElement(item.id, this.toPinnedItem(item));
            }
        });
        toRemoveFromStatusBar.forEach(id => this.statusBar.removeElement(id));
    }

    protected toPinnedItem(item: LanguageStatus): StatusBarEntry {
        return {
            text: item.label,
            affinity: { id: EditorLanguageStatusService.LANGUAGE_MODE_ID, alignment: StatusBarAlignment.RIGHT, compact: false },
            alignment: StatusBarAlignment.RIGHT,
            onclick: item.command && (e => { e.preventDefault(); this.commandRegistry.executeCommand(item.command!.id, ...(item.command?.arguments ?? [])); }),
        };
    }

    protected createTooltip(items: LanguageStatus[]): HTMLElement {
        const hoverContainer = document.createElement('div');
        hoverContainer.classList.add('hover-row');
        for (const item of items) {
            hoverContainer.appendChild(this.createTooltipItem(item));
        }
        return hoverContainer;
    }

    protected createTooltipItem(item: LanguageStatus): HTMLElement {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('hover-language-status');

        itemContainer.appendChild(this.createSeverityIndicator(item.severity));

        const textContainer = document.createElement('div');
        textContainer.className = 'element';
        textContainer.appendChild(this.createLabelSection(item));
        textContainer.appendChild(this.createCommandSection(item));

        itemContainer.appendChild(textContainer);
        return itemContainer;
    }

    protected createSeverityIndicator(severity: Severity): HTMLElement {
        const severityContainer = document.createElement('div');
        severityContainer.classList.add('severity', `sev${severity}`);
        severityContainer.classList.toggle('show', severity === Severity.Error || severity === Severity.Warning);

        const severityIcon = document.createElement('span');
        severityIcon.className = this.getSeverityIconClasses(severity);
        severityContainer.appendChild(severityIcon);

        return severityContainer;
    }

    protected createLabelSection(item: LanguageStatus): HTMLElement {
        const labelContainer = document.createElement('div');
        labelContainer.className = 'left';

        const label = document.createElement('span');
        label.classList.add('label');
        const labelText = item.busy ? `$(sync~spin)\u00A0\u00A0${item.label}` : item.label;
        this.renderWithIcons(label, labelText);
        labelContainer.appendChild(label);

        const detail = document.createElement('span');
        detail.classList.add('detail');
        this.renderWithIcons(detail, item.detail);
        labelContainer.appendChild(detail);

        return labelContainer;
    }

    protected createCommandSection(item: LanguageStatus): HTMLElement {
        const commandContainer = document.createElement('div');
        commandContainer.classList.add('right');

        if (item.command) {
            commandContainer.appendChild(this.createCommandLink(item));
            commandContainer.appendChild(this.createPinButton(item));
        }

        return commandContainer;
    }

    protected createCommandLink(item: LanguageStatus): HTMLElement {
        const command = item.command!;
        const link = document.createElement('a');
        link.classList.add('language-status-link');
        link.href = new URI()
            .withScheme('command')
            .withPath(command.id)
            .withQuery(command.arguments ? encodeURIComponent(JSON.stringify(command.arguments)) : '')
            .toString(false);
        link.onclick = e => {
            e.preventDefault();
            this.commandRegistry.executeCommand(command.id, ...(command.arguments ?? []));
        };
        link.textContent = command.title ?? command.id;
        link.title = command.tooltip ?? '';
        link.ariaRoleDescription = 'button';
        link.ariaDisabled = 'false';
        return link;
    }

    protected createPinButton(item: LanguageStatus): HTMLElement {
        const pinContainer = document.createElement('div');
        pinContainer.classList.add('language-status-action-bar');

        const pin = document.createElement('a');
        this.setPinProperties(pin, item.id);
        pin.onclick = e => {
            e.preventDefault();
            this.togglePinned(item);
            this.setPinProperties(pin, item.id);
        };
        pinContainer.appendChild(pin);

        return pinContainer;
    }

    protected setPinProperties(pin: HTMLElement, id: string): void {
        pin.className = this.pinnedCommands.has(id) ? codicon('pinned', true) : codicon('pin', true);
        pin.ariaRoleDescription = 'button';
        const pinText = this.pinnedCommands.has(id)
            ? nls.localizeByDefault('Remove from Status Bar')
            : nls.localizeByDefault('Add to Status Bar');
        pin.ariaLabel = pinText;
        pin.title = pinText;
    }

    protected togglePinned(item: LanguageStatus): void {
        if (this.pinnedCommands.has(item.id)) {
            this.pinnedCommands.delete(item.id);
            this.statusBar.removeElement(item.id);
        } else {
            this.pinnedCommands.add(item.id);
            this.statusBar.setElement(item.id, this.toPinnedItem(item));
        }
    }

    protected getSeverityIconClasses(severity: Severity): string {
        switch (severity) {
            case Severity.Error: return codicon('error');
            case Severity.Warning: return codicon('info');
            default: return codicon('check');
        }
    }

    protected renderWithIcons(host: HTMLElement, text?: string): void {
        if (text) {
            for (const chunk of this.labelParser.parse(text)) {
                if (typeof chunk === 'string') {
                    host.append(chunk);
                } else {
                    const iconSpan = document.createElement('span');
                    const className = codicon(chunk.name) + (chunk.animation ? ` fa-${chunk.animation}` : '');
                    iconSpan.className = className;
                    host.append(iconSpan);
                }
            }
        }
    }
}
