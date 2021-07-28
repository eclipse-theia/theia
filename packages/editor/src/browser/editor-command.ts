/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { CommandContribution, CommandRegistry, Command } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { CommonCommands, PreferenceService, LabelProvider, ApplicationShell, QuickInputService, QuickPickItem, QuickPickValue } from '@theia/core/lib/browser';
import { EditorManager } from './editor-manager';
import { EditorPreferences } from './editor-preferences';
import { ResourceProvider, MessageService } from '@theia/core';
import { LanguageService, Language } from '@theia/core/lib/browser/language-service';
import { SUPPORTED_ENCODINGS } from '@theia/core/lib/browser/supported-encodings';
import { EncodingMode } from './editor';

export namespace EditorCommands {

    const EDITOR_CATEGORY = 'Editor';
    const VIEW_CATEGORY = 'View';

    /**
     * Show editor references
     */
    export const SHOW_REFERENCES: Command = {
        id: 'textEditor.commands.showReferences'
    };
    /**
     * Change indentation configuration (i.e., indent using tabs / spaces, and how many spaces per tab)
     */
    export const CONFIG_INDENTATION: Command = {
        id: 'textEditor.commands.configIndentation'
    };

    export const CONFIG_EOL: Command = {
        id: 'textEditor.commands.configEol',
        category: EDITOR_CATEGORY,
        label: 'Change End of Line Sequence'
    };

    export const INDENT_USING_SPACES: Command = {
        id: 'textEditor.commands.indentUsingSpaces',
        category: EDITOR_CATEGORY,
        label: 'Indent Using Spaces'
    };
    export const INDENT_USING_TABS: Command = {
        id: 'textEditor.commands.indentUsingTabs',
        category: EDITOR_CATEGORY,
        label: 'Indent Using Tabs'
    };
    export const CHANGE_LANGUAGE: Command = {
        id: 'textEditor.change.language',
        category: EDITOR_CATEGORY,
        label: 'Change Language Mode'
    };
    export const CHANGE_ENCODING: Command = {
        id: 'textEditor.change.encoding',
        category: EDITOR_CATEGORY,
        label: 'Change File Encoding'
    };
    export const REVERT_AND_CLOSE: Command = {
        id: 'workbench.action.revertAndCloseActiveEditor',
        category: 'View',
        label: 'Revert and Close Editor'
    };

    /**
     * Command for going back to the last editor navigation location.
     */
    export const GO_BACK: Command = {
        id: 'textEditor.commands.go.back',
        category: EDITOR_CATEGORY,
        label: 'Go Back'
    };
    /**
     * Command for going to the forthcoming editor navigation location.
     */
    export const GO_FORWARD: Command = {
        id: 'textEditor.commands.go.forward',
        category: EDITOR_CATEGORY,
        label: 'Go Forward'
    };
    /**
     * Command that reveals the last text edit location, if any.
     */
    export const GO_LAST_EDIT: Command = {
        id: 'textEditor.commands.go.lastEdit',
        category: EDITOR_CATEGORY,
        label: 'Go to Last Edit Location'
    };
    /**
     * Command that clears the editor navigation history.
     */
    export const CLEAR_EDITOR_HISTORY: Command = {
        id: 'textEditor.commands.clear.history',
        category: EDITOR_CATEGORY,
        label: 'Clear Editor History'
    };
    /**
     * Command that displays all editors that are currently opened.
     */
    export const SHOW_ALL_OPENED_EDITORS: Command = {
        id: 'workbench.action.showAllEditors',
        category: VIEW_CATEGORY,
        label: 'Show All Opened Editors'
    };
    /**
     * Command that toggles the minimap.
     */
    export const TOGGLE_MINIMAP: Command = {
        id: 'editor.action.toggleMinimap',
        category: VIEW_CATEGORY,
        label: 'Toggle Minimap'
    };
    /**
     * Command that toggles the rendering of whitespace characters in the editor.
     */
    export const TOGGLE_RENDER_WHITESPACE: Command = {
        id: 'editor.action.toggleRenderWhitespace',
        category: VIEW_CATEGORY,
        label: 'Toggle Render Whitespace'
    };
    /**
     * Command that toggles the word wrap.
     */
    export const TOGGLE_WORD_WRAP: Command = {
        id: 'editor.action.toggleWordWrap',
        category: VIEW_CATEGORY,
        label: 'Toggle Word Wrap'
    };
    /**
     * Command that re-opens the last closed editor.
     */
    export const REOPEN_CLOSED_EDITOR: Command = {
        id: 'workbench.action.reopenClosedEditor',
        category: VIEW_CATEGORY,
        label: 'Reopen Closed Editor'
    };
    /**
     * Opens a second instance of the current editor, splitting the view in the direction specified.
     */
    export const SPLIT_EDITOR_RIGHT: Command = {
        id: 'workbench.action.splitEditorRight',
        category: VIEW_CATEGORY,
        label: 'Split Editor Right'
    };
    export const SPLIT_EDITOR_DOWN: Command = {
        id: 'workbench.action.splitEditorDown',
        category: VIEW_CATEGORY,
        label: 'Split Editor Down'
    };
    export const SPLIT_EDITOR_UP: Command = {
        id: 'workbench.action.splitEditorUp',
        category: VIEW_CATEGORY,
        label: 'Split Editor Up'
    };
    export const SPLIT_EDITOR_LEFT: Command = {
        id: 'workbench.action.splitEditorLeft',
        category: VIEW_CATEGORY,
        label: 'Split Editor Left'
    };
    /**
     * Default horizontal split: right.
     */
    export const SPLIT_EDITOR_HORIZONTAL: Command = {
        id: 'workbench.action.splitEditor',
        category: VIEW_CATEGORY,
        label: 'Split Editor'
    };
    /**
     * Default vertical split: down.
     */
    export const SPLIT_EDITOR_VERTICAL: Command = {
        id: 'workbench.action.splitEditorOrthogonal',
        category: VIEW_CATEGORY,
        label: 'Split Editor Orthogonal'
    };
}

@injectable()
export class EditorCommandContribution implements CommandContribution {

    public static readonly AUTOSAVE_PREFERENCE: string = 'editor.autoSave';

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(PreferenceService)
    protected readonly preferencesService: PreferenceService;

    @inject(EditorPreferences)
    protected readonly editorPreferences: EditorPreferences;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService) protected readonly messageService: MessageService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(LanguageService)
    protected readonly languages: LanguageService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @postConstruct()
    protected init(): void {
        this.editorPreferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'editor.autoSave' && e.newValue === 'on') {
                this.shell.saveAll();
            }
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(EditorCommands.SHOW_REFERENCES);
        registry.registerCommand(EditorCommands.CONFIG_INDENTATION);
        registry.registerCommand(EditorCommands.CONFIG_EOL);
        registry.registerCommand(EditorCommands.INDENT_USING_SPACES);
        registry.registerCommand(EditorCommands.INDENT_USING_TABS);
        registry.registerCommand(EditorCommands.REVERT_AND_CLOSE);
        registry.registerCommand(EditorCommands.CHANGE_LANGUAGE, {
            isEnabled: () => this.canConfigureLanguage(),
            isVisible: () => this.canConfigureLanguage(),
            execute: () => this.configureLanguage()
        });
        registry.registerCommand(EditorCommands.CHANGE_ENCODING, {
            isEnabled: () => this.canConfigureEncoding(),
            isVisible: () => this.canConfigureEncoding(),
            execute: () => this.configureEncoding()
        });

        registry.registerCommand(EditorCommands.GO_BACK);
        registry.registerCommand(EditorCommands.GO_FORWARD);
        registry.registerCommand(EditorCommands.GO_LAST_EDIT);
        registry.registerCommand(EditorCommands.CLEAR_EDITOR_HISTORY);
        registry.registerCommand(EditorCommands.TOGGLE_MINIMAP);
        registry.registerCommand(EditorCommands.TOGGLE_RENDER_WHITESPACE);
        registry.registerCommand(EditorCommands.TOGGLE_WORD_WRAP);
        registry.registerCommand(EditorCommands.REOPEN_CLOSED_EDITOR);

        registry.registerCommand(CommonCommands.AUTO_SAVE, {
            isToggled: () => this.isAutoSaveOn(),
            execute: () => this.toggleAutoSave()
        });
    }

    protected canConfigureLanguage(): boolean {
        const widget = this.editorManager.currentEditor;
        const editor = widget && widget.editor;
        return !!editor && !!this.languages.languages;
    }
    protected async configureLanguage(): Promise<void> {
        const widget = this.editorManager.currentEditor;
        const editor = widget && widget.editor;
        if (!editor || !this.languages.languages) {
            return;
        }
        const current = editor.document.languageId;
        const items: Array<QuickPickValue<'autoDetect' | Language> | QuickPickItem> = [
            { label: 'Auto Detect', value: 'autoDetect' },
            { type: 'separator', label: 'languages (identifier)' },
            ... (this.languages.languages.map(language => this.toQuickPickLanguage(language, current))).sort((e, e2) => e.label.localeCompare(e2.label))
        ];
        const selectedMode = await this.quickInputService?.showQuickPick(items, { placeholder: 'Select Language Mode' });
        if (selectedMode && ('value' in selectedMode)) {
            if (selectedMode.value === 'autoDetect') {
                editor.detectLanguage();
            } else if (selectedMode.value) {
                editor.setLanguage(selectedMode.value.id);
            }
        }
    }

    protected canConfigureEncoding(): boolean {
        const widget = this.editorManager.currentEditor;
        const editor = widget && widget.editor;
        return !!editor;
    }
    protected async configureEncoding(): Promise<void> {
        const widget = this.editorManager.currentEditor;
        const editor = widget && widget.editor;
        if (!editor) {
            return;
        }
        const reopenWithEncodingPick = { label: 'Reopen with Encoding', value: 'reopen' };
        const saveWithEncodingPick = { label: 'Save with Encoding', value: 'save' };
        const actionItems: QuickPickValue<string>[] = [
            reopenWithEncodingPick,
            saveWithEncodingPick
        ];
        const selectedEncoding = await this.quickInputService?.showQuickPick(actionItems, { placeholder: 'Select Action' });
        if (!selectedEncoding) {
            return;
        }
        const isReopenWithEncoding = (selectedEncoding.value === reopenWithEncodingPick.value);

        const configuredEncoding = this.preferencesService.get<string>('files.encoding', 'utf8', editor.uri.toString());

        const resource = await this.resourceProvider(editor.uri);
        const guessedEncoding = resource.guessEncoding ? await resource.guessEncoding() : undefined;
        resource.dispose();

        const encodingItems: QuickPickValue<{ id: string, description: string }>[] = Object.keys(SUPPORTED_ENCODINGS)
            .sort((k1, k2) => {
                if (k1 === configuredEncoding) {
                    return -1;
                } else if (k2 === configuredEncoding) {
                    return 1;
                }
                return SUPPORTED_ENCODINGS[k1].order - SUPPORTED_ENCODINGS[k2].order;
            })
            .filter(k => {
                if (k === guessedEncoding && guessedEncoding !== configuredEncoding) {
                    return false; // do not show encoding if it is the guessed encoding that does not match the configured
                }

                return !isReopenWithEncoding || !SUPPORTED_ENCODINGS[k].encodeOnly; // hide those that can only be used for encoding if we are about to decode
            })
            .map(key => ({ label: SUPPORTED_ENCODINGS[key].labelLong, value: { id: key, description: key } }));

        // Insert guessed encoding
        if (guessedEncoding && configuredEncoding !== guessedEncoding && SUPPORTED_ENCODINGS[guessedEncoding]) {
            encodingItems.unshift({
                label: `Guessed from content: ${SUPPORTED_ENCODINGS[guessedEncoding].labelLong}`,
                value: { id: guessedEncoding, description: guessedEncoding }
            });
        }
        const selectedFileEncoding = await this.quickInputService?.showQuickPick<QuickPickValue<{ id: string, description: string }>>(encodingItems, {
            placeholder: isReopenWithEncoding ? 'Select File Encoding to Reopen File' : 'Select File Encoding to Save with'
        });

        if (!selectedFileEncoding) {
            return;
        }
        if (editor.document.dirty && isReopenWithEncoding) {
            this.messageService.info('The file is dirty. Please save it first before reopening it with another encoding.');
            return;
        } else if (selectedFileEncoding.value) {
            editor.setEncoding(selectedFileEncoding.value.id, isReopenWithEncoding ? EncodingMode.Decode : EncodingMode.Encode);
        }
    }

    protected toQuickPickLanguage(value: Language, current: string): QuickPickValue<Language> {
        const languageUri = this.toLanguageUri(value);
        const icon = this.labelProvider.getIcon(languageUri);
        const iconClasses = icon !== '' ? [icon + ' file-icon'] : undefined;
        return {
            value,
            label: value.name,
            description: `(${value.id})${current === value.id ? ' - Configured Language' : ''}`,
            iconClasses
        };
    }
    protected toLanguageUri(language: Language): URI {
        const extension = language.extensions.values().next();
        if (extension.value) {
            return new URI('file:///' + extension.value);
        }
        const filename = language.filenames.values().next();
        if (filename.value) {
            return new URI('file:///' + filename.value);
        }
        return new URI('file:///.txt');
    }

    private isAutoSaveOn(): boolean {
        const autoSave = this.preferencesService.get(EditorCommandContribution.AUTOSAVE_PREFERENCE);
        return autoSave === 'on' || autoSave === undefined;
    }
    private async toggleAutoSave(): Promise<void> {
        this.preferencesService.updateValue(EditorCommandContribution.AUTOSAVE_PREFERENCE, this.isAutoSaveOn() ? 'off' : 'on');
    }
}
