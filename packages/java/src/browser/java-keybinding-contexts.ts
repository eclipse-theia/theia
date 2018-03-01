/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { EditorTextFocusContext, EditorWidget } from "@theia/editor/lib/browser";
import { JAVA_LANGUAGE_ID } from "../common";

export namespace JavaKeybindingContexts {
    export const javaEditorTextFocus = 'javaEditorTextFocus';
}

@injectable()
export class JavaEditorTextFocusContext extends EditorTextFocusContext {

    readonly id: string = JavaKeybindingContexts.javaEditorTextFocus;

    protected canHandle(widget: EditorWidget): boolean {
        return super.canHandle(widget) && widget.editor.document.languageId === JAVA_LANGUAGE_ID;
    }

}
