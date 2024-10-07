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

import { EditorManager } from './editor-manager';
import { TextEditor } from './editor';
import { injectable, inject, optional } from '@theia/core/shared/inversify';
import { StatusBarAlignment, StatusBar } from '@theia/core/lib/browser/status-bar/status-bar';
import {
    FrontendApplicationContribution, DiffUris, DockLayout,
    QuickInputService, KeybindingRegistry, KeybindingContribution, SHELL_TABBAR_CONTEXT_SPLIT, ApplicationShell,
    WidgetStatusBarContribution,
    Widget
} from '@theia/core/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { CommandHandler, DisposableCollection, MenuContribution, MenuModelRegistry } from '@theia/core';
import { EditorCommands } from './editor-command';
import { CommandRegistry, CommandContribution } from '@theia/core/lib/common';
import { SUPPORTED_ENCODINGS } from '@theia/core/lib/browser/supported-encodings';
import { nls } from '@theia/core/lib/common/nls';
import { CurrentWidgetCommandAdapter } from '@theia/core/lib/browser/shell/current-widget-command-adapter';
import { EditorWidget } from './editor-widget';
import { EditorLanguageStatusService } from './language-status/editor-language-status-service';

@injectable()
export class EditorContribution implements FrontendApplicationContribution,
    CommandContribution, KeybindingContribution, MenuContribution, WidgetStatusBarContribution<EditorWidget> {

    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(EditorLanguageStatusService) protected readonly languageStatusService: EditorLanguageStatusService;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(QuickInputService) @optional()
    protected readonly quickInputService: QuickInputService;

    onStart(): void {
        this.initEditorContextKeys();
    }

    protected initEditorContextKeys(): void {
        const editorIsOpen = this.contextKeyService.createKey<boolean>('editorIsOpen', false);
        const textCompareEditorVisible = this.contextKeyService.createKey<boolean>('textCompareEditorVisible', false);
        const updateContextKeys = () => {
            const widgets = this.editorManager.all;
            editorIsOpen.set(!!widgets.length);
            textCompareEditorVisible.set(widgets.some(widget => DiffUris.isDiffUri(widget.editor.uri)));
        };
        updateContextKeys();
        for (const widget of this.editorManager.all) {
            widget.disposed.connect(updateContextKeys);
        }
        this.editorManager.onCreated(widget => {
            updateContextKeys();
            widget.disposed.connect(updateContextKeys);
        });
    }

    protected readonly toDisposeOnCurrentEditorChanged = new DisposableCollection();

    canHandle(widget: Widget): widget is EditorWidget {
        return widget instanceof EditorWidget;
    }

    activate(statusBar: StatusBar, widget: EditorWidget): void {
        this.toDisposeOnCurrentEditorChanged.dispose();
        const editor = widget.editor;
        this.updateLanguageStatus(statusBar, editor);
        this.updateEncodingStatus(statusBar, editor);
        this.setCursorPositionStatus(statusBar, editor);
        this.toDisposeOnCurrentEditorChanged.pushAll([
            editor.onLanguageChanged(() => this.updateLanguageStatus(statusBar, editor)),
            editor.onEncodingChanged(() => this.updateEncodingStatus(statusBar, editor)),
            editor.onCursorPositionChanged(() => this.setCursorPositionStatus(statusBar, editor))
        ]);
    }

    deactivate(statusBar: StatusBar): void {
        this.toDisposeOnCurrentEditorChanged.dispose();
        this.updateLanguageStatus(statusBar, undefined);
        this.updateEncodingStatus(statusBar, undefined);
        this.setCursorPositionStatus(statusBar, undefined);
    }

    protected updateLanguageStatus(statusBar: StatusBar, editor: TextEditor | undefined): void {
        this.languageStatusService.updateLanguageStatus(editor);
    }

    protected updateEncodingStatus(statusBar: StatusBar, editor: TextEditor | undefined): void {
        if (!editor) {
            statusBar.removeElement('editor-status-encoding');
            return;
        }
        statusBar.setElement('editor-status-encoding', {
            text: SUPPORTED_ENCODINGS[editor.getEncoding()].labelShort,
            alignment: StatusBarAlignment.RIGHT,
            priority: 10,
            command: EditorCommands.CHANGE_ENCODING.id,
            tooltip: nls.localizeByDefault('Select Encoding')
        });
    }

    protected setCursorPositionStatus(statusBar: StatusBar, editor: TextEditor | undefined): void {
        if (!editor) {
            statusBar.removeElement('editor-status-cursor-position');
            return;
        }
        const { cursor } = editor;
        statusBar.setElement('editor-status-cursor-position', {
            text: nls.localizeByDefault('Ln {0}, Col {1}', cursor.line + 1, editor.getVisibleColumn(cursor)),
            alignment: StatusBarAlignment.RIGHT,
            priority: 100,
            tooltip: EditorCommands.GOTO_LINE_COLUMN.label,
            command: EditorCommands.GOTO_LINE_COLUMN.id
        });
    }

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(EditorCommands.SHOW_ALL_OPENED_EDITORS, {
            execute: () => this.quickInputService?.open('edt ')
        });
        const splitHandlerFactory = (splitMode: DockLayout.InsertMode): CommandHandler => new CurrentWidgetCommandAdapter(this.shell, {
            isEnabled: title => title?.owner instanceof EditorWidget,
            execute: async title => {
                if (title?.owner instanceof EditorWidget) {
                    const selection = title.owner.editor.selection;
                    const newEditor = await this.editorManager.openToSide(title.owner.editor.uri, { selection, widgetOptions: { mode: splitMode, ref: title.owner } });
                    const oldEditorState = title.owner.editor.storeViewState();
                    newEditor.editor.restoreViewState(oldEditorState);
                }
            }
        });
        commands.registerCommand(EditorCommands.SPLIT_EDITOR_HORIZONTAL, splitHandlerFactory('split-right'));
        commands.registerCommand(EditorCommands.SPLIT_EDITOR_VERTICAL, splitHandlerFactory('split-bottom'));
        commands.registerCommand(EditorCommands.SPLIT_EDITOR_RIGHT, splitHandlerFactory('split-right'));
        commands.registerCommand(EditorCommands.SPLIT_EDITOR_DOWN, splitHandlerFactory('split-bottom'));
        commands.registerCommand(EditorCommands.SPLIT_EDITOR_UP, splitHandlerFactory('split-top'));
        commands.registerCommand(EditorCommands.SPLIT_EDITOR_LEFT, splitHandlerFactory('split-left'));
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: EditorCommands.SHOW_ALL_OPENED_EDITORS.id,
            keybinding: 'ctrlcmd+k ctrlcmd+p'
        });
        keybindings.registerKeybinding({
            command: EditorCommands.SPLIT_EDITOR_HORIZONTAL.id,
            keybinding: 'ctrlcmd+\\',
        });
        keybindings.registerKeybinding({
            command: EditorCommands.SPLIT_EDITOR_VERTICAL.id,
            keybinding: 'ctrlcmd+k ctrlcmd+\\',
        });
    }

    registerMenus(registry: MenuModelRegistry): void {
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_SPLIT, {
            commandId: EditorCommands.SPLIT_EDITOR_UP.id,
            label: nls.localizeByDefault('Split Up'),
            order: '1',
        });
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_SPLIT, {
            commandId: EditorCommands.SPLIT_EDITOR_DOWN.id,
            label: nls.localizeByDefault('Split Down'),
            order: '2',
        });
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_SPLIT, {
            commandId: EditorCommands.SPLIT_EDITOR_LEFT.id,
            label: nls.localizeByDefault('Split Left'),
            order: '3',
        });
        registry.registerMenuAction(SHELL_TABBAR_CONTEXT_SPLIT, {
            commandId: EditorCommands.SPLIT_EDITOR_RIGHT.id,
            label: nls.localizeByDefault('Split Right'),
            order: '4',
        });
    }
}
