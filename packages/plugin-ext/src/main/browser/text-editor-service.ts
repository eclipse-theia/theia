/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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
import { Emitter } from '@theia/core';
import { EditorManager, EditorWidget } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import { inject, injectable } from 'inversify';

@injectable()
export class TextEditorService {
    private readonly onTextEditorAddEmitter = new Emitter<MonacoEditor>();
    readonly onTextEditorAdd = this.onTextEditorAddEmitter.event;

    private readonly onTextEditorRemoveEmitter = new Emitter<MonacoEditor>();
    readonly onTextEditorRemove = this.onTextEditorRemoveEmitter.event;

    constructor(@inject(EditorManager) private editorManager: EditorManager) {
        editorManager.onCreated(w => this.onEditorCreated(w));
        editorManager.all.forEach(w => this.onEditorCreated(w));
    }

    listTextEditors(): MonacoEditor[] {
        return this.editorManager.all.map(w => MonacoEditor.get(w)!).filter(editor => editor !== undefined);
    }

    getActiveEditor(): EditorWidget | undefined {
        return this.editorManager.activeEditor;
    }

    private onEditorCreated(editor: EditorWidget): void {
        const monacoEditor = MonacoEditor.get(editor);
        if (monacoEditor) {
            this.onEditorAdded(monacoEditor);
            editor.disposed.connect(e => this.onEditorRemoved(monacoEditor));
        }
    }

    private onEditorAdded(editor: MonacoEditor): void {
        this.onTextEditorAddEmitter.fire(editor);
    }

    private onEditorRemoved(editor: MonacoEditor): void {
        this.onTextEditorRemoveEmitter.fire(editor);
    }
}
