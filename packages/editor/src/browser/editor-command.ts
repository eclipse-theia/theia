// *****************************************************************************
// Copyright (C) 2017 TypeFox and others.
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

import { inject, injectable, optional, postConstruct } from '@theia/core/shared/inversify';
import { CommonCommands, PreferenceService, LabelProvider, ApplicationShell, QuickInputService, QuickPickValue, SaveableService } from '@theia/core/lib/browser';
import { EditorManager } from './editor-manager';
import { CommandContribution, CommandRegistry, Command, ResourceProvider, MessageService, nls } from '@theia/core';
import { LanguageService } from '@theia/core/lib/browser/language-service';
import { SUPPORTED_ENCODINGS } from '@theia/core/lib/browser/supported-encodings';
import { EncodingMode } from './editor';
import { EditorLanguageQuickPickService } from './editor-language-quick-pick-service';

export namespace EditorCommands {

    const EDITOR_CATEGORY = 'Editor';
    const EDITOR_CATEGORY_KEY = nls.getDefaultKey(EDITOR_CATEGORY);

    export const GOTO_LINE_COLUMN = Command.toDefaultLocalizedCommand({
        id: 'editor.action.gotoLine',
        label: 'Go to Line/Column'
    });

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

    export const CONFIG_EOL = Command.toDefaultLocalizedCommand({
        id: 'textEditor.commands.configEol',
        category: EDITOR_CATEGORY,
        label: 'Change End of Line Sequence'
    });

    export const INDENT_USING_SPACES = Command.toDefaultLocalizedCommand({
        id: 'textEditor.commands.indentUsingSpaces',
        category: EDITOR_CATEGORY,
        label: 'Indent Using Spaces'
    });
    export const INDENT_USING_TABS = Command.toDefaultLocalizedCommand({
        id: 'textEditor.commands.indentUsingTabs',
        category: EDITOR_CATEGORY,
        label: 'Indent Using Tabs'
    });
    export const CHANGE_LANGUAGE = Command.toDefaultLocalizedCommand({
        id: 'textEditor.change.language',
        category: EDITOR_CATEGORY,
        label: 'Change Language Mode'
    });
    export const CHANGE_ENCODING = Command.toDefaultLocalizedCommand({
        id: 'textEditor.change.encoding',
        category: EDITOR_CATEGORY,
        label: 'Change File Encoding'
    });
    export const REVERT_EDITOR = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.files.revert',
        category: CommonCommands.FILE_CATEGORY,
        label: 'Revert File',
    });
    export const REVERT_AND_CLOSE = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.revertAndCloseActiveEditor',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Revert and Close Editor'
    });

    /**
     * Command for going back to the last editor navigation location.
     */
    export const GO_BACK = Command.toDefaultLocalizedCommand({
        id: 'textEditor.commands.go.back',
        category: EDITOR_CATEGORY,
        label: 'Go Back'
    });
    /**
     * Command for going to the forthcoming editor navigation location.
     */
    export const GO_FORWARD = Command.toDefaultLocalizedCommand({
        id: 'textEditor.commands.go.forward',
        category: EDITOR_CATEGORY,
        label: 'Go Forward'
    });
    /**
     * Command that reveals the last text edit location, if any.
     */
    export const GO_LAST_EDIT = Command.toDefaultLocalizedCommand({
        id: 'textEditor.commands.go.lastEdit',
        category: EDITOR_CATEGORY,
        label: 'Go to Last Edit Location'
    });
    /**
     * Command that clears the editor navigation history.
     */
    export const CLEAR_EDITOR_HISTORY = Command.toDefaultLocalizedCommand({
        id: 'textEditor.commands.clear.history',
        category: EDITOR_CATEGORY,
        label: 'Clear Editor History'
    });
    /**
     * Command that displays all editors that are currently opened.
     */
    export const SHOW_ALL_OPENED_EDITORS = Command.toLocalizedCommand({
        id: 'workbench.action.showAllEditors',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Show All Opened Editors'
    }, 'theia/editor/showAllEditors', EDITOR_CATEGORY_KEY);
    /**
     * Command that toggles the minimap.
     */
    export const TOGGLE_MINIMAP = Command.toDefaultLocalizedCommand({
        id: 'editor.action.toggleMinimap',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Toggle Minimap'
    });
    /**
     * Command that toggles the rendering of whitespace characters in the editor.
     */
    export const TOGGLE_RENDER_WHITESPACE = Command.toDefaultLocalizedCommand({
        id: 'editor.action.toggleRenderWhitespace',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Toggle Render Whitespace'
    });
    /**
     * Command that toggles the word wrap.
     */
    export const TOGGLE_WORD_WRAP = Command.toDefaultLocalizedCommand({
        id: 'editor.action.toggleWordWrap',
        label: 'View: Toggle Word Wrap'
    });
    /**
     * Command that toggles sticky scroll.
     */
    export const TOGGLE_STICKY_SCROLL = Command.toLocalizedCommand({
        id: 'editor.action.toggleStickyScroll',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Toggle Sticky Scroll',
    }, 'theia/editor/toggleStickyScroll', EDITOR_CATEGORY_KEY);
    /**
     * Command that re-opens the last closed editor.
     */
    export const REOPEN_CLOSED_EDITOR = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.reopenClosedEditor',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Reopen Closed Editor'
    });
    /**
     * Opens a second instance of the current editor, splitting the view in the direction specified.
     */
    export const SPLIT_EDITOR_RIGHT = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.splitEditorRight',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Split Editor Right'
    });
    export const SPLIT_EDITOR_DOWN = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.splitEditorDown',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Split Editor Down'
    });
    export const SPLIT_EDITOR_UP = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.splitEditorUp',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Split Editor Up'
    });
    export const SPLIT_EDITOR_LEFT = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.splitEditorLeft',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Split Editor Left'
    });
    /**
     * Default horizontal split: right.
     */
    export const SPLIT_EDITOR_HORIZONTAL = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.splitEditor',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Split Editor'
    });
    /**
     * Default vertical split: down.
     */
    export const SPLIT_EDITOR_VERTICAL = Command.toDefaultLocalizedCommand({
        id: 'workbench.action.splitEditorOrthogonal',
        category: CommonCommands.VIEW_CATEGORY,
        label: 'Split Editor Orthogonal'
    });
}

@injectable()
export class EditorCommandContribution implements CommandContribution {

    static readonly AUTOSAVE_PREFERENCE: string = 'files.autoSave';
    static readonly AUTOSAVE_DELAY_PREFERENCE: string = 'files.autoSaveDelay';

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(PreferenceService)
    protected readonly preferencesService: PreferenceService;

    @inject(SaveableService)
    protected readonly saveResourceService: SaveableService;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    @inject(MessageService)
    protected readonly messageService: MessageService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(LanguageService)
    protected readonly languages: LanguageService;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(ResourceProvider)
    protected readonly resourceProvider: ResourceProvider;

    @inject(EditorLanguageQuickPickService)
    protected readonly codeLanguageQuickPickService: EditorLanguageQuickPickService;

    @postConstruct()
    protected init(): void {
        this.preferencesService.ready.then(() => {
            this.saveResourceService.autoSave = this.preferencesService.get(EditorCommandContribution.AUTOSAVE_PREFERENCE) ?? 'off';
            this.saveResourceService.autoSaveDelay = this.preferencesService.get(EditorCommandContribution.AUTOSAVE_DELAY_PREFERENCE) ?? 1000;
        });
        this.preferencesService.onPreferenceChanged(e => {
            if (e.preferenceName === EditorCommandContribution.AUTOSAVE_PREFERENCE) {
                this.saveResourceService.autoSave = this.preferencesService.get(EditorCommandContribution.AUTOSAVE_PREFERENCE) ?? 'off';
            } else if (e.preferenceName === EditorCommandContribution.AUTOSAVE_DELAY_PREFERENCE) {
                this.saveResourceService.autoSaveDelay = this.preferencesService.get(EditorCommandContribution.AUTOSAVE_DELAY_PREFERENCE) ?? 1000;
            }
        });
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(EditorCommands.SHOW_REFERENCES);
        registry.registerCommand(EditorCommands.CONFIG_INDENTATION);
        registry.registerCommand(EditorCommands.CONFIG_EOL);
        registry.registerCommand(EditorCommands.INDENT_USING_SPACES);
        registry.registerCommand(EditorCommands.INDENT_USING_TABS);
        registry.registerCommand(EditorCommands.REVERT_EDITOR);
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
        registry.registerCommand(EditorCommands.TOGGLE_STICKY_SCROLL);
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
        const selectedMode = await this.codeLanguageQuickPickService.pickEditorLanguage(current);
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
        const reopenWithEncodingPick = { label: nls.localizeByDefault('Reopen with Encoding'), value: 'reopen' };
        const saveWithEncodingPick = { label: nls.localizeByDefault('Save with Encoding'), value: 'save' };
        const actionItems: QuickPickValue<string>[] = [
            reopenWithEncodingPick,
            saveWithEncodingPick
        ];
        const selectedEncoding = await this.quickInputService?.showQuickPick(actionItems, { placeholder: nls.localizeByDefault('Select Action') });
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
                label: `${nls.localizeByDefault('Guessed from content')}: ${SUPPORTED_ENCODINGS[guessedEncoding].labelLong}`,
                value: { id: guessedEncoding, description: guessedEncoding }
            });
        }
        const selectedFileEncoding = await this.quickInputService?.showQuickPick<QuickPickValue<{ id: string, description: string }>>(encodingItems, {
            placeholder: isReopenWithEncoding ?
                nls.localizeByDefault('Select File Encoding to Reopen File') :
                nls.localizeByDefault('Select File Encoding to Save with')
        });

        if (!selectedFileEncoding) {
            return;
        }
        if (editor.document.dirty && isReopenWithEncoding) {
            this.messageService.info(nls.localize('theia/editor/dirtyEncoding', 'The file is dirty. Please save it first before reopening it with another encoding.'));
            return;
        } else if (selectedFileEncoding.value) {
            editor.setEncoding(selectedFileEncoding.value.id, isReopenWithEncoding ? EncodingMode.Decode : EncodingMode.Encode);
        }
    }

    protected isAutoSaveOn(): boolean {
        const autoSave = this.preferencesService.get(EditorCommandContribution.AUTOSAVE_PREFERENCE);
        return autoSave !== 'off';
    }

    protected async toggleAutoSave(): Promise<void> {
        this.preferencesService.updateValue(EditorCommandContribution.AUTOSAVE_PREFERENCE, this.isAutoSaveOn() ? 'off' : 'afterDelay');
    }
}
