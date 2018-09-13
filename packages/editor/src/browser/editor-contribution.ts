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

import { EditorManager } from './editor-manager';
import { TextEditor } from './editor';
import { injectable, inject } from 'inversify';
import { StatusBarAlignment, StatusBar } from '@theia/core/lib/browser/status-bar/status-bar';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Languages } from '@theia/languages/lib/browser';
import { DisposableCollection } from '@theia/core';
import { EditorCommands } from './editor-command';

@injectable()
export class EditorContribution implements FrontendApplicationContribution {

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(Languages) protected readonly languages: Languages;

    onStart(): void {
        this.updateStatusBar();
        this.editorManager.onCurrentEditorChanged(() => this.updateStatusBar());
    }

    protected readonly toDisposeOnCurrentEditorChanged = new DisposableCollection();
    protected updateStatusBar(): void {
        this.toDisposeOnCurrentEditorChanged.dispose();

        const widget = this.editorManager.currentEditor;
        const editor = widget && widget.editor;
        this.updateLanguageStatus(editor);
        this.setCursorPositionStatus(editor);
        if (editor) {
            this.toDisposeOnCurrentEditorChanged.pushAll([
                editor.onLanguageChanged(() => this.updateLanguageStatus(editor)),
                editor.onCursorPositionChanged(() => this.setCursorPositionStatus(editor))
            ]);
        }
    }

    protected updateLanguageStatus(editor: TextEditor | undefined): void {
        if (!editor) {
            this.statusBar.removeElement('editor-status-language');
            return;
        }
        const language = this.languages.getLanguage && this.languages.getLanguage(editor.document.languageId);
        const languageName = language ? language.name : '';
        this.statusBar.setElement('editor-status-language', {
            text: languageName,
            alignment: StatusBarAlignment.RIGHT,
            priority: 1,
            command: EditorCommands.CHANGE_LANGUAGE.id
        });
    }

    protected setCursorPositionStatus(editor: TextEditor | undefined): void {
        if (!editor) {
            this.statusBar.removeElement('editor-status-cursor-position');
            return;
        }
        const { cursor } = editor;
        this.statusBar.setElement('editor-status-cursor-position', {
            text: `Ln ${cursor.line + 1}, Col ${editor.getVisibleColumn(cursor)}`,
            alignment: StatusBarAlignment.RIGHT,
            priority: 100
        });
    }
}
