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
import URI from '@theia/core/lib/common/uri';
import { StatusBarAlignment, StatusBar } from '@theia/core/lib/browser/status-bar/status-bar';
import { FrontendApplicationContribution, DiffUris } from '@theia/core/lib/browser';
import { Languages } from '@theia/languages/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { DisposableCollection } from '@theia/core';
import { EditorCommands } from './editor-command';

@injectable()
export class EditorContribution implements FrontendApplicationContribution {

    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(EditorManager) protected readonly editorManager: EditorManager;
    @inject(Languages) protected readonly languages: Languages;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    onStart(): void {
        this.initEditorContextKeys();

        this.updateStatusBar();
        this.editorManager.onCurrentEditorChanged(() => this.updateStatusBar());
    }

    /** @deprecated since 0.5.0 - will be removed in farther releases */
    protected initResourceContextKeys(): void {
    }
    /** @deprecated since 0.5.0 - will be removed in farther releases */
    protected getLanguageId(uri: URI | undefined): string | undefined {
        const { languages } = this.languages;
        if (uri && languages) {
            for (const language of languages) {
                if (language.extensions.has(uri.path.ext)) {
                    return language.id;
                }
            }
        }
        return undefined;
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
