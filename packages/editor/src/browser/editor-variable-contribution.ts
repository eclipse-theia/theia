/*
 * Copyright (C) 2018 Red Hat, Inc. and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { injectable, inject } from 'inversify';
import { VariableRegistry, VariableContribution } from '@theia/variable-resolver/lib/browser';
import { TextEditor } from './editor';
import { EditorManager } from './editor-manager';

@injectable()
export class EditorVariableContribution implements VariableContribution {

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    registerVariables(variables: VariableRegistry): void {
        variables.registerVariable({
            name: 'lineNumber',
            description: 'The current line number in the currently opened file',
            resolve: () => {
                const editor = this.getCurrentEditor();
                return editor ? `${editor.cursor.line + 1}` : undefined;
            }
        });
    }

    protected getCurrentEditor(): TextEditor | undefined {
        const currentEditor = this.editorManager.currentEditor;
        if (!currentEditor) {
            return undefined;
        }
        return currentEditor.editor;
    }
}
