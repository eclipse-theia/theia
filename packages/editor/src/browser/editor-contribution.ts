/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { EditorManager } from './editor-manager';
import { TextEditor } from './editor';
import { injectable, inject } from 'inversify';
import { StatusBarAlignment, StatusBar } from '@theia/core/lib/browser/status-bar/status-bar';
import { Position } from 'vscode-languageserver-types';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Languages } from '@theia/languages/lib/common';
import { DisposableCollection } from '@theia/core';

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
        if (widget) {
            const languageId = widget.editor.document.languageId;
            const languages = this.languages.languages || [];
            const language = languages.find(l => l.id === languageId);
            const languageName = language ? language.name : '';
            this.statusBar.setElement('editor-status-language', {
                text: languageName,
                alignment: StatusBarAlignment.RIGHT,
                priority: 1
            });

            this.setCursorPositionStatus(widget.editor.cursor, widget.editor);
            this.toDisposeOnCurrentEditorChanged.push(
                widget.editor.onCursorPositionChanged(position =>
                    this.setCursorPositionStatus(position, widget.editor)
                )
            );
        } else {
            this.statusBar.removeElement('editor-status-language');
            this.statusBar.removeElement('editor-status-cursor-position');
        }
    }

    protected setCursorPositionStatus(position: Position, editor: TextEditor): void {
        this.statusBar.setElement('editor-status-cursor-position', {
            text: `Ln ${position.line + 1}, Col ${editor.getVisibleColumn(position)}`,
            alignment: StatusBarAlignment.RIGHT,
            priority: 100
        });
    }
}
