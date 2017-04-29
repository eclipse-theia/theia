/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */
import { injectable } from "inversify";
import { Emitter, Event } from "../../application/common";
import { EditorWidget } from "./editor-widget";

@injectable()
export class EditorRegistry {
    protected readonly editors = new Map<string, Promise<EditorWidget> | EditorWidget | undefined>();
    protected readonly onEditorsChangedEmitter = new Emitter<void>();

    onEditorsChanged(): Event<void> {
        return this.onEditorsChangedEmitter.event;
    }

    getEditorCount(): number {
        return this.editors.size;
    }

    getOpenedEditors(): EditorWidget[] {
        return Array.from(this.editors.values()).filter(editor => editor instanceof EditorWidget) as EditorWidget[];
    }

    getEditor(key: string): Promise<EditorWidget> | undefined {
        const editor = this.editors.get(key);
        if (editor) {
            return Promise.resolve(editor);
        }
        return undefined;
    }

    addEditor(key: string, editor: EditorWidget): void {
        editor.id = `editor-${this.getEditorCount()}`;
        this.editors.set(key, editor);
        this.onEditorsChangedEmitter.fire(undefined);
    }

    removeEditor(key: string): void {
        if (this.editors.delete(key)) {
            this.onEditorsChangedEmitter.fire(undefined);
        }
    }
}
