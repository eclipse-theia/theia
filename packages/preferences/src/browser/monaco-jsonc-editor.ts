/********************************************************************************
 * Copyright (C) 2021 Ericsson and others.
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

import * as jsoncparser from 'jsonc-parser';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoWorkspace } from '@theia/monaco/lib/browser/monaco-workspace';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class MonacoJSONCEditor {
    @inject(MonacoWorkspace) protected readonly workspace: MonacoWorkspace;

    async setValue(model: MonacoEditorModel, path: string[], value: unknown, shouldSave = true): Promise<void> {
        const edits = this.getEditOperations(model, path, value);
        if (edits.length > 0) {
            await this.workspace.applyBackgroundEdit(model, edits, shouldSave);
        }
    }

    getEditOperations(model: MonacoEditorModel, path: string[], value: unknown): monaco.editor.IIdentifiedSingleEditOperation[] {
        const textModel = model.textEditorModel;
        const content = model.getText().trim();
        // Everything is already undefined - no need for changes.
        if (!content && value === undefined) {
            return [];
        }
        // Delete the entire document.
        if (!path.length && value === undefined) {
            return [{
                range: textModel.getFullModelRange(),
                text: null, // eslint-disable-line no-null/no-null
                forceMoveMarkers: false
            }];
        }
        const { insertSpaces, tabSize, defaultEOL } = textModel.getOptions();
        const jsonCOptions = {
            formattingOptions: {
                insertSpaces,
                tabSize,
                eol: defaultEOL === monaco.editor.DefaultEndOfLine.LF ? '\n' : '\r\n'
            }
        };
        return jsoncparser.modify(content, path, value, jsonCOptions).map(edit => {
            const start = textModel.getPositionAt(edit.offset);
            const end = textModel.getPositionAt(edit.offset + edit.length);
            return {
                range: monaco.Range.fromPositions(start, end),
                text: edit.content || null, // eslint-disable-line no-null/no-null
                forceMoveMarkers: false
            };
        });
    }
}
