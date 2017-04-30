/*
 * Copyright (C) 2017 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import URI from "../../application/common/uri";
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

    getEditor(uri: URI): Promise<EditorWidget> | undefined {
        const editor = this.editors.get(uri.toString());
        if (editor) {
            return Promise.resolve(editor);
        }
        return undefined;
    }

    addEditor(uri: URI, editor: EditorWidget): void {
        editor.id = `editor-${this.getEditorCount()}`;
        this.editors.set(uri.toString(), editor);
        this.onEditorsChangedEmitter.fire(undefined);
    }

    removeEditor(uri: URI): void {
        if (this.editors.delete(uri.toString())) {
            this.onEditorsChangedEmitter.fire(undefined);
        }
    }
}
