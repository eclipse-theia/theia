/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable } from "inversify";
import { TextEditor } from "../editor";
import { EditorDecoration } from "./editor-decoration";

@injectable()
export abstract class EditorDecorator {

    protected readonly appliedDecorations = new Map<string, string[]>();

    protected setDecorations(editor: TextEditor, newDecorations: EditorDecoration[]) {
        const uri = editor.uri.toString();
        const oldDecorations = this.appliedDecorations.get(uri) || [];
        if (oldDecorations.length === 0 && newDecorations.length === 0) {
            return;
        }
        const decorationIds = editor.deltaDecorations({ oldDecorations, newDecorations });
        this.appliedDecorations.set(uri, decorationIds);
    }

}
