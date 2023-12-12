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

@injectable()
export class NotebookEditorWidgetService {

    @inject(ApplicationShell)
    protected applicationShell: ApplicationShell;

    private readonly notebookEditors = new Map<string, NotebookEditorWidget>();

    private readonly onNotebookEditorAddEmitter = new Emitter<NotebookEditorWidget>();
    private readonly onNotebookEditorRemoveEmitter = new Emitter<NotebookEditorWidget>();
    readonly onDidAddNotebookEditor = this.onNotebookEditorAddEmitter.event;
    readonly onDidRemoveNotebookEditor = this.onNotebookEditorRemoveEmitter.event;

    private readonly onDidChangeFocusedEditorEmitter = new Emitter<NotebookEditorWidget | undefined>();
    readonly onDidChangeFocusedEditor = this.onDidChangeFocusedEditorEmitter.event;

    focusedEditor?: NotebookEditorWidget = undefined;

    @postConstruct()
    protected init(): void {
        this.applicationShell.onDidChangeActiveWidget(event => {
            if (event.newValue instanceof NotebookEditorWidget) {
                if (event.newValue !== this.focusedEditor) {
                    this.focusedEditor = event.newValue;
                    this.onDidChangeFocusedEditorEmitter.fire(this.focusedEditor);
                }
            } else if (event.newValue) {
                // Only unfocus editor if a new widget has been focused
                this.focusedEditor = undefined;
                this.onDidChangeFocusedEditorEmitter.fire(undefined);
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

}
