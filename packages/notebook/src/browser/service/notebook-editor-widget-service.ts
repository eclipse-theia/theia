// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
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

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '@theia/core';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser';
import { NotebookEditorWidget } from '../notebook-editor-widget';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { NOTEBOOK_EDITOR_FOCUSED } from '../contributions/notebook-context-keys';

@injectable()
export class NotebookEditorWidgetService {

    @inject(ApplicationShell)
    protected applicationShell: ApplicationShell;

    @inject(ContextKeyService)
    protected contextKeyService: ContextKeyService;

    protected readonly notebookEditors = new Map<string, NotebookEditorWidget>();

    protected readonly onNotebookEditorAddEmitter = new Emitter<NotebookEditorWidget>();
    protected readonly onNotebookEditorRemoveEmitter = new Emitter<NotebookEditorWidget>();
    readonly onDidAddNotebookEditor = this.onNotebookEditorAddEmitter.event;
    readonly onDidRemoveNotebookEditor = this.onNotebookEditorRemoveEmitter.event;

    protected readonly onDidChangeFocusedEditorEmitter = new Emitter<NotebookEditorWidget | undefined>();
    readonly onDidChangeFocusedEditor = this.onDidChangeFocusedEditorEmitter.event;

    protected readonly onDidChangeCurrentEditorEmitter = new Emitter<NotebookEditorWidget | undefined>();
    readonly onDidChangeCurrentEditor = this.onDidChangeCurrentEditorEmitter.event;

    focusedEditor?: NotebookEditorWidget = undefined;

    currentEditor?: NotebookEditorWidget = undefined;

    @postConstruct()
    protected init(): void {
        this.applicationShell.onDidChangeActiveWidget(event => {
            this.notebookEditorFocusChanged(event.newValue as NotebookEditorWidget, event.newValue instanceof NotebookEditorWidget);
        });
        this.applicationShell.onDidChangeCurrentWidget(event => {
            if (event.newValue instanceof NotebookEditorWidget || event.oldValue instanceof NotebookEditorWidget) {
                this.currentNotebookEditorChanged(event.newValue);
            }
        });
    }

    // --- editor management

    addNotebookEditor(editor: NotebookEditorWidget): void {
        if (this.notebookEditors.has(editor.id)) {
            console.warn('Attempting to add duplicated notebook editor: ' + editor.id);
        }
        this.notebookEditors.set(editor.id, editor);
        this.onNotebookEditorAddEmitter.fire(editor);
        if (editor.isVisible) {
            this.notebookEditorFocusChanged(editor, true);
        }
    }

    removeNotebookEditor(editor: NotebookEditorWidget): void {
        if (this.notebookEditors.has(editor.id)) {
            this.notebookEditors.delete(editor.id);
            this.onNotebookEditorRemoveEmitter.fire(editor);
        } else {
            console.warn('Attempting to remove not registered editor: ' + editor.id);
        }
    }

    getNotebookEditor(editorId: string): NotebookEditorWidget | undefined {
        return this.notebookEditors.get(editorId);
    }

    getNotebookEditors(): readonly NotebookEditorWidget[] {
        return Array.from(this.notebookEditors.values());
    }

    notebookEditorFocusChanged(editor: NotebookEditorWidget, focus: boolean): void {
        if (focus) {
            if (editor !== this.focusedEditor) {
                this.focusedEditor = editor;
                this.contextKeyService.setContext(NOTEBOOK_EDITOR_FOCUSED, true);
                this.onDidChangeFocusedEditorEmitter.fire(this.focusedEditor);
            }
        } else if (this.focusedEditor) {
            this.focusedEditor = undefined;
            this.contextKeyService.setContext(NOTEBOOK_EDITOR_FOCUSED, false);
            this.onDidChangeFocusedEditorEmitter.fire(undefined);
        }
    }

    currentNotebookEditorChanged(newEditor: unknown): void {
        if (newEditor instanceof NotebookEditorWidget) {
            this.currentEditor = newEditor;
            this.onDidChangeCurrentEditorEmitter.fire(newEditor);
        } else if (this.currentEditor?.isDisposed || !this.currentEditor?.isVisible) {
            this.currentEditor = undefined;
            this.onDidChangeCurrentEditorEmitter.fire(undefined);
        }
    }

}
