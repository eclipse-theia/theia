/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
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
