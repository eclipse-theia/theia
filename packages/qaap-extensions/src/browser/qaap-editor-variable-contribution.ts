// *****************************************************************************
// Copyright (C) 2026 Theia contributors and Qaap product fork.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { EditorVariableContribution } from '@theia/editor/lib/browser/editor-variable-contribution';
import { VariableRegistry } from '@theia/variable-resolver/lib/browser';

@injectable()
export class QaapEditorVariableContribution extends EditorVariableContribution {

    override registerVariables(variables: VariableRegistry): void {
        variables.registerVariable({
            name: 'lineNumber',
            description: 'The current line number in the currently opened file',
            resolve: () => {
                const editor = this.getCurrentEditor();
                try {
                    const cursor = editor?.cursor;
                    return cursor ? `${cursor.line + 1}` : undefined;
                } catch {
                    return undefined;
                }
            }
        });
        variables.registerVariable({
            name: 'selectedText',
            description: 'The current selected text in the active file',
            resolve: () => {
                const editor = this.getCurrentEditor();
                return editor?.document.getText(editor.selection);
            }
        });
        variables.registerVariable({
            name: 'currentText',
            description: 'The current text in the active file',
            resolve: () => {
                const editor = this.getCurrentEditor();
                return editor?.document.getText();
            }
        });
    }
}
