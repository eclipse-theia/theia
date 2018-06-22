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
import { Event, Emitter } from "@theia/core";
import { EditorManager, EditorWidget } from "@theia/editor/lib/browser";
import { injectable, inject } from "inversify";
import { MonacoEditor } from "@theia/monaco/lib/browser/monaco-editor";

export const TextEditorService = Symbol('TextEditorService');
/**
 * Stores TextEditor and handles lifecycle
 */
export interface TextEditorService {
    onTextEditorAdd: Event<MonacoEditor>;
    onTextEditorRemove: Event<MonacoEditor>;
    listTextEditors(): MonacoEditor[];

    getActiveEditor(): EditorWidget | undefined;
}

@injectable()
export class TextEditorServiceImpl implements TextEditorService {
    private onTextEditorAddEmitter = new Emitter<MonacoEditor>();
    private onTextEditorRemoveEmitter = new Emitter<MonacoEditor>();

    onTextEditorAdd: Event<MonacoEditor> = this.onTextEditorAddEmitter.event;
    onTextEditorRemove: Event<MonacoEditor> = this.onTextEditorRemoveEmitter.event;

    private editors = new Map<string, MonacoEditor>();

    constructor(@inject(EditorManager) private editorManager: EditorManager) {
        editorManager.onCurrentEditorChanged(this.onEditorChanged);
        editorManager.onCreated(w => this.onEditorCreated(w));
    }

    listTextEditors(): MonacoEditor[] {
        return Array.from(this.editors.values());
    }

    getActiveEditor(): EditorWidget | undefined {
        return this.editorManager.activeEditor;
    }

    private onEditorChanged(editor: EditorWidget | undefined): void {
        // console.log(`Current Editor Changed: ${editor}`);
    }

    private onEditorCreated(editor: EditorWidget): void {
        const monacoEditor = MonacoEditor.get(editor);
        if (monacoEditor) {
            this.onEditorAdded(monacoEditor);
            editor.disposed.connect(e => this.onEditorRemoved(monacoEditor));
        }
    }

    private onEditorAdded(editor: MonacoEditor): void {
        if (!this.editors.has(editor.getControl().getId())) {
            this.editors.set(editor.getControl().getId(), editor);
            this.onTextEditorAddEmitter.fire(editor);
        }
    }
    private onEditorRemoved(editor: MonacoEditor) {
        if (this.editors.has(editor.getControl().getId())) {
            this.editors.delete(editor.getControl().getId());
            this.onTextEditorRemoveEmitter.fire(editor);
        }
    }

}
