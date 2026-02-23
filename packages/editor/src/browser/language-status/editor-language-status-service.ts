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
import { codicon, HoverService, StatusBar, StatusBarAlignment, StatusBarEntry } from '@theia/core/lib/browser';
import { LanguageService } from '@theia/core/lib/browser/language-service';
import { CommandRegistry, DisposableCollection, MessageService, nls } from '@theia/core';
import { TextEditor } from '../editor';
import { EditorCommands } from '../editor-command';
import { LanguageSelector, score } from '../../common/language-selector';
import { AccessibilityInformation } from '@theia/core/lib/common/accessibility';
import URI from '@theia/core/lib/common/uri';
import { CurrentEditorAccess } from '../editor-manager';
import { Severity } from '@theia/core/lib/common/severity';
import { LabelParser } from '@theia/core/lib/browser/label-parser';
import { FormatterService } from '../editor-formatter-service';
import { EditorFormatterStatusContribution } from './editor-formatter-status-contribution';

/**
 * Represents the severity of a language status item.
 */
export enum LanguageStatusSeverity {
    Information = 0,
    Warning = 1,
    Error = 2
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
    @inject(EditorFormatterStatusContribution) @optional() protected readonly formatterStatusContribution: EditorFormatterStatusContribution | undefined;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(HoverService) protected readonly hoverService: HoverService;

    protected static LANGUAGE_MODE_ID = 'editor-status-language';
    protected static LANGUAGE_STATUS_ID = 'editor-language-status-items';

    protected readonly status = new Map<number, LanguageStatus>();
    protected pinnedCommands = new Set<string>();
    protected currentlyPinnedItems = new Set<string>();
    protected readonly toDisposeOnEditorChange = new DisposableCollection();
    protected pendingUpdate: Promise<void> | undefined;

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
        this.scheduleUpdate(editor, true);

        if (editor) {
            this.toDisposeOnEditorChange.push(
                editor.onLanguageChanged(() => this.scheduleUpdate(editor, false))
            );

            if (this.formatterService) {
                this.toDisposeOnEditorChange.push(
                    this.formatterService.onDidChangeFormatters(() => this.scheduleUpdate(editor, false))
                );
            }
        }
    }

    /**
     * Schedules an update to the status bar. All updates are chained to prevent race conditions.
     * @param editor The current editor, or undefined if no editor is active
     * @param updateLanguageMode Whether to update the language mode element (only needed on editor change)
     */
    protected scheduleUpdate(editor: TextEditor | undefined, updateLanguageMode: boolean): void {
        const doUpdate = async (): Promise<void> => {
            if (updateLanguageMode) {
                await this.updateLanguageModeElement(editor);
            }
            await this.doUpdateLanguageStatusItems(editor);
        };

        if (!this.pendingUpdate) {
            this.pendingUpdate = Promise.resolve();
        }
        this.pendingUpdate = this.pendingUpdate.then(doUpdate, doUpdate);
    }

    protected async updateLanguageModeElement(editor: TextEditor | undefined): Promise<void> {
        if (!editor) {
            await this.statusBar.removeElement(EditorLanguageStatusService.LANGUAGE_MODE_ID);
            return;
        }
        const language = this.languages.getLanguage(editor.document.languageId);
        const languageName = language ? language.name : '';
        await this.statusBar.setElement(EditorLanguageStatusService.LANGUAGE_MODE_ID, {
            text: languageName,
            alignment: StatusBarAlignment.RIGHT,
            priority: 1,
            command: EditorCommands.CHANGE_LANGUAGE.id,
            tooltip: nls.localizeByDefault('Select Language Mode')
        });
    }

    protected createFormatterStatusItem(editor: TextEditor): LanguageStatus | undefined {
        return this.formatterStatusContribution?.createFormatterStatusItem(editor);
    }

    /**
     * Schedules a language status items update. Called when language status items are added/removed.
     */
    protected updateLanguageStatusItems(editor = this.editorAccess.editor): void {
        this.scheduleUpdate(editor, false);
    }

    /**
     * Performs the actual language status items update.
     */
    protected async doUpdateLanguageStatusItems(editor: TextEditor | undefined): Promise<void> {
        if (!editor) {
            await this.statusBar.removeElement(EditorLanguageStatusService.LANGUAGE_STATUS_ID);
            await this.updatePinnedItems();
            return;
        }
        const uri = new URI(editor.document.uri);
        const formatterItemId = EditorFormatterStatusContribution.FORMATTER_STATUS_ITEM_ID;

        const items = Array.from(this.status.values())
            .filter(item => item.id !== formatterItemId)
            .filter(item => score(item.selector, uri.scheme, uri.path.toString(), editor.document.languageId, true))
            .sort((left, right) => right.severity - left.severity);

        const formatterItem = this.createFormatterStatusItem(editor);
        const allItems = formatterItem ? [formatterItem, ...items] : items;

        if (!allItems.length) {
            await this.statusBar.removeElement(EditorLanguageStatusService.LANGUAGE_STATUS_ID);
            await this.updatePinnedItems();
            return;
        }
        const maxSeverity = allItems.reduce((max, item) => Math.max(max, item.severity), Severity.Ignore);
        const severityText = maxSeverity === Severity.Info
            ? '$(bracket)'
            : maxSeverity === Severity.Warning
                ? '$(bracket-dot)'
                : '$(bracket-error)';
        await this.statusBar.setElement(EditorLanguageStatusService.LANGUAGE_STATUS_ID, {
            text: severityText,
            alignment: StatusBarAlignment.RIGHT,
            priority: 2,
            tooltip: this.createTooltip(allItems, editor),
            affinity: { id: EditorLanguageStatusService.LANGUAGE_MODE_ID, alignment: StatusBarAlignment.LEFT, compact: true },
        });
        await this.updatePinnedItems(allItems, editor);
    }

    /**
     * Updates pinned status bar items. Removes all currently pinned items first,
     * then adds back only those relevant to the current editor context.
     */
    protected async updatePinnedItems(items?: LanguageStatus[], editor?: TextEditor): Promise<void> {
        for (const id of this.currentlyPinnedItems) {
            await this.statusBar.removeElement(id);
        }
        this.currentlyPinnedItems.clear();

        for (const item of items ?? []) {
            if (this.pinnedCommands.has(item.id)) {
                await this.statusBar.setElement(item.id, this.toPinnedItem(item, editor));
                this.currentlyPinnedItems.add(item.id);
            }
        }
    }

    protected toPinnedItem(item: LanguageStatus, editor?: TextEditor): StatusBarEntry {
        if (this.isFormatterItem(item)) {
            return this.createFormatterPinnedItem(item, editor);
        }

        return this.createDefaultPinnedItem(item);
    }

    protected isFormatterItem(item: LanguageStatus): boolean {
        return item.id === EditorFormatterStatusContribution.FORMATTER_STATUS_ITEM_ID;
    }

    protected createFormatterPinnedItem(item: LanguageStatus, editor?: TextEditor): StatusBarEntry {
        if (!this.formatterStatusContribution) {
            return this.createDefaultPinnedItem(item);
        }

        const currentEditor = editor ?? this.editorAccess.editor;
        return this.formatterStatusContribution.createPinnedStatusBarEntry(currentEditor, e => {
            e.preventDefault();
            if (currentEditor) {
                this.formatterStatusContribution?.showFormatterQuickPick(currentEditor);
            }
        });
    }

    protected createDefaultPinnedItem(item: LanguageStatus): StatusBarEntry {
        let onclick: ((e: MouseEvent) => void) | undefined;
        if (item.command) {
            onclick = e => {
                e.preventDefault();
                this.commandRegistry.executeCommand(item.command!.id, ...(item.command?.arguments ?? []));
            };
        }

        return {
            text: item.label,
            affinity: { id: EditorLanguageStatusService.LANGUAGE_MODE_ID, alignment: StatusBarAlignment.RIGHT, compact: false },
            alignment: StatusBarAlignment.RIGHT,
            onclick,
        };
    }

    protected createTooltip(items: LanguageStatus[], editor?: TextEditor): HTMLElement {
        const hoverContainer = document.createElement('div');
        hoverContainer.classList.add('hover-row');
        for (const item of items) {
            hoverContainer.appendChild(this.createTooltipItem(item, editor));
        }
        return hoverContainer;
    }

    protected createTooltipItem(item: LanguageStatus, editor?: TextEditor): HTMLElement {
        const itemContainer = document.createElement('div');
        itemContainer.classList.add('hover-language-status');

        itemContainer.appendChild(this.createSeverityIndicator(item.severity));

        const textContainer = document.createElement('div');
        textContainer.className = 'element';
        textContainer.appendChild(this.createLabelSection(item));
        textContainer.appendChild(this.createCommandSection(item, editor));

        itemContainer.appendChild(textContainer);
        return itemContainer;
    }

    protected createSeverityIndicator(severity: Severity, alwaysShow = false): HTMLElement {
        const severityContainer = document.createElement('div');
        severityContainer.classList.add('severity', `sev${severity}`);
        severityContainer.classList.toggle('show', alwaysShow || severity === Severity.Error || severity === Severity.Warning);

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

    protected createCommandSection(item: LanguageStatus, editor?: TextEditor): HTMLElement {
        const commandContainer = document.createElement('div');
        commandContainer.classList.add('right');

        if (this.isFormatterItem(item) && editor && this.formatterStatusContribution) {
            this.addFormatterCommands(commandContainer, item, editor);
        } else if (item.command) {
            commandContainer.appendChild(this.createCommandLink(item));
            commandContainer.appendChild(this.createPinButton(item, editor));
        }

        return commandContainer;
    }

    protected addFormatterCommands(commandContainer: HTMLElement, item: LanguageStatus, editor: TextEditor): void {
        const hasConfigureAction = this.formatterStatusContribution!.hasConfigureAction(editor);

        if (hasConfigureAction) {
            commandContainer.appendChild(this.createFormatterConfigureButton(editor));
        }
        commandContainer.appendChild(this.createFormatterInfoButton(editor));
        commandContainer.appendChild(this.createPinButton(item, editor));
    }

    protected createFormatterConfigureButton(editor: TextEditor): HTMLElement {
        const link = document.createElement('a');
        link.classList.add('language-status-link');
        link.onclick = e => {
            e.preventDefault();
            this.hoverService.cancelHover();
            this.formatterStatusContribution?.showFormatterQuickPick(editor);
        };
        link.textContent = nls.localizeByDefault('Configure');
        link.title = nls.localizeByDefault('Configure Default Formatter');
        link.ariaRoleDescription = 'button';
        link.ariaDisabled = 'false';
        return link;
    }

    protected createFormatterInfoButton(editor: TextEditor): HTMLElement {
        const link = document.createElement('a');
        link.classList.add('language-status-link');
        link.onclick = e => {
            e.preventDefault();
            this.hoverService.cancelHover();
            const tooltip = this.formatterStatusContribution?.getTooltip(editor) ?? '';
            this.messageService.info(tooltip);
        };
        link.textContent = nls.localizeByDefault('Info');
        link.title = nls.localize('theia/editor/showFormatterInfo', 'Show Formatter Info');
        link.ariaRoleDescription = 'button';
        link.ariaDisabled = 'false';
        return link;
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

    protected createPinButton(item: LanguageStatus, editor?: TextEditor): HTMLElement {
        const pinContainer = document.createElement('div');
        pinContainer.classList.add('language-status-action-bar');

        const pin = document.createElement('a');
        this.setPinProperties(pin, item.id);
        pin.onclick = e => {
            e.preventDefault();
            this.togglePinned(item, editor);
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

    /**
     * Toggles whether a language status item is pinned to the status bar.
     */
    protected togglePinned(item: LanguageStatus, editor?: TextEditor): void {
        if (this.pinnedCommands.has(item.id)) {
            this.pinnedCommands.delete(item.id);
        } else {
            this.pinnedCommands.add(item.id);
        }

        this.updateLanguageStatusItems(editor);
    }

    protected getSeverityIconClasses(severity: Severity): string {
        switch (severity) {
            case Severity.Error: return codicon('error');
            case Severity.Warning: return codicon('warning');
            default: return codicon('info');
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
