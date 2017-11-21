/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { EditorManager } from './editor-manager';
import { injectable, inject } from "inversify";
import { StatusBarAlignment, StatusBar } from '@theia/core/lib/browser/status-bar/status-bar';
import { FileIconProvider } from '@theia/filesystem/lib/browser/icons/file-icons';
import { Position } from 'vscode-languageserver-types';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Languages } from '@theia/languages/lib/common';
import { DisposableCollection } from '@theia/core';

@injectable()
export class EditorContribution implements FrontendApplicationContribution {

    protected toDispose = new DisposableCollection();

    constructor(
        @inject(StatusBar) protected readonly statusBar: StatusBar,
        @inject(EditorManager) protected readonly editorManager: EditorManager,
        @inject(FileIconProvider) protected readonly iconProvider: FileIconProvider,
        @inject(Languages) protected readonly languages: Languages
    ) { }

    onStart() {
        this.addStatusBarWidgets();
    }

    protected async addStatusBarWidgets() {
        this.editorManager.onCurrentEditorChanged(async e => {
            if (e) {
                const langId = e.editor.document.languageId;
                const languages = this.languages.languages;
                let languageName: string = '';
                if (languages) {
                    const language = languages.find(l => l.id === langId);
                    languageName = language ? language.name : '';
                }
                this.statusBar.setElement('editor-status-language', {
                    text: languageName,
                    alignment: StatusBarAlignment.RIGHT,
                    priority: 1
                });

                this.setCursorPositionStatus(e.editor.cursor);
                this.toDispose.dispose();
                this.toDispose.push(e.editor.onCursorPositionChanged(position => {
                    this.setCursorPositionStatus(position);
                }));
            } else if (this.editorManager.editors.length === 0) {
                this.statusBar.removeElement('editor-status-language');
                this.statusBar.removeElement('editor-status-cursor-position');
            }
        });
    }

    protected setCursorPositionStatus(position: Position) {
        this.statusBar.setElement('editor-status-cursor-position', {
            text: `Ln ${position.line + 1}, Col ${position.character + 1}`,
            alignment: StatusBarAlignment.RIGHT,
            priority: 100
        });
    }
}
