/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from "inversify";
import { EditorManager, TextEditor } from '@theia/editor/lib/browser';
import { Location } from 'vscode-languageserver-types';

@injectable()
export class CurrentEditorAccess {

    @inject(EditorManager) protected readonly editorManager: EditorManager;

    getSelection(): Location | undefined {
        const activeEditor = this.getCurrentEditor();
        if (!activeEditor) {
            return;
        }
        const range = activeEditor.selection;
        const uri = activeEditor.uri.toString();
        return <Location>{ range, uri };
    }

    getLanguageId(): string | undefined {
        const activeEditor = this.getCurrentEditor();
        if (!activeEditor) {
            return;
        }
        return activeEditor.document.languageId;
    }

    protected getCurrentEditor(): TextEditor | undefined {
        const activeEditor = this.editorManager.currentEditor;
        if (activeEditor) {
            return activeEditor.editor;
        }
        return undefined;
    }

}
