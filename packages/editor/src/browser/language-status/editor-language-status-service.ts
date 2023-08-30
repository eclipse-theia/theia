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

import { injectable, inject } from '@theia/core/shared/inversify';
import { codicon, StatusBar, StatusBarAlignment, StatusBarEntry } from '@theia/core/lib/browser';
import { LanguageService } from '@theia/core/lib/browser/language-service';
import { CommandRegistry, nls } from '@theia/core';
import { TextEditor } from '../editor';
import { EditorCommands } from '../editor-command';
import { LanguageSelector, score } from '../../common/language-selector';
import { AccessibilityInformation } from '@theia/core/lib/common/accessibility';
import URI from '@theia/core/lib/common/uri';
import { CurrentEditorAccess } from '../editor-manager';
import { Severity } from '@theia/core/lib/common/severity';
import { LabelParser } from '@theia/core/lib/browser/label-parser';

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
    protected static LANGUAGE_MODE_ID = 'editor-status-language';
    protected static LANGUAGE_STATUS_ID = 'editor-language-status-items';

    protected readonly status = new Map<number, LanguageStatus>();
    protected pinnedCommands = new Set<string>();

    setLanguageStatusItem(handle: number, item: LanguageStatus): void {
        this.status.set(handle, item);
        this.updateLanguageStatusItems();
    }

    removeLanguageStatusItem(handle: number): void {
        this.status.delete(handle);
        this.updateLanguageStatusItems();
    }

    updateLanguageStatus(editor: TextEditor | undefined): void {
        if (!editor) {
            this.statusBar.removeElement(EditorLanguageStatusService.LANGUAGE_MODE_ID);
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
            const itemContainer = document.createElement('div');
            itemContainer.classList.add('hover-language-status');
            {
                const severityContainer = document.createElement('div');
                severityContainer.classList.add('severity', `sev${item.severity}`);
                severityContainer.classList.toggle('show', item.severity === Severity.Error || item.severity === Severity.Warning);
                {
                    const severityIcon = document.createElement('span');
                    severityIcon.className = this.getSeverityIconClasses(item.severity);
                    severityContainer.appendChild(severityIcon);
                }
                itemContainer.appendChild(severityContainer);
            }
            const textContainer = document.createElement('div');
            textContainer.className = 'element';
            const labelContainer = document.createElement('div');
            labelContainer.className = 'left';
            const label = document.createElement('span');
            label.classList.add('label');
            this.renderWithIcons(label, item.busy ? `$(sync~spin)\u00A0\u00A0${item.label}` : item.label);
            labelContainer.appendChild(label);
            const detail = document.createElement('span');
            detail.classList.add('detail');
            this.renderWithIcons(detail, item.detail);
            labelContainer.appendChild(detail);
            textContainer.appendChild(labelContainer);
            const commandContainer = document.createElement('div');
            commandContainer.classList.add('right');
            if (item.command) {
                const link = document.createElement('a');
                link.classList.add('language-status-link');
                link.href = new URI()
                    .withScheme('command')
                    .withPath(item.command.id)
                    .withQuery(item.command.arguments ? encodeURIComponent(JSON.stringify(item.command.arguments)) : '')
                    .toString(false);
                link.onclick = e => { e.preventDefault(); this.commandRegistry.executeCommand(item.command!.id, ...(item.command?.arguments ?? [])); };
                link.textContent = item.command.title ?? item.command.id;
                link.title = item.command.tooltip ?? '';
                link.ariaRoleDescription = 'button';
                link.ariaDisabled = 'false';
                commandContainer.appendChild(link);
                const pinContainer = document.createElement('div');
                pinContainer.classList.add('language-status-action-bar');
                const pin = document.createElement('a');
                this.setPinProperties(pin, item.id);
                pin.onclick = e => { e.preventDefault(); this.togglePinned(item); this.setPinProperties(pin, item.id); };
                pinContainer.appendChild(pin);
                commandContainer.appendChild(pinContainer);
            }
            textContainer.appendChild(commandContainer);
            itemContainer.append(textContainer);
            hoverContainer.appendChild(itemContainer);
        }
        return hoverContainer;
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
