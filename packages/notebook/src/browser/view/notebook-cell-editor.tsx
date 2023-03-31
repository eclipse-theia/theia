// *****************************************************************************
// Copyright (C) 2023 TypeFox and others.
//
// This program and the accompanying materials are made available under the
// terms of the Eclipse Public License v. 2.0 which is available at
// http://www.eclipse.org/legal/epl-2.0.
//
// This Source Code may also be made available under the following Secondary
// Licenses when the conditions for such availability set forth in the Eclipse
// Public License v. 2.0 are satisfied: GNU General Public License, version 2
// with the GNU Classpath Exception which is available at
// https://www.gnu.org/software/classpath/license.html.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { NotebookModel } from '../view-model/notebook-model';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';

interface EditorProps {
    notebookModel: NotebookModel,
    editorProvider: MonacoEditorProvider,
    cell: NotebookCellModel
}

export function Editor({ notebookModel, editorProvider, cell }: EditorProps): JSX.Element {
    const uri = cell.uri;
    React.useEffect(() => {
        (async () => {
            const editorNode = document.getElementById(uri.toString())!;
            const editor = await editorProvider.createInline(uri, editorNode, { minHeight: -1, maxHeight: -1, autoSizing: true }, true);
            editor.setLanguage(cell.language);
            editor.getControl().onDidContentSizeChange(() => {
                editorNode.style.height = editor.getControl().getContentHeight() + 7 + 'px';
                editor.resizeToFit();
            });
            editor.document.onDirtyChanged(() => notebookModel.cellDirtyChanged(cell, editor.document.dirty));
            editor.onDocumentContentChanged(e => cell.source = e.document.getText());
        })();
    }, []);
    return <div className='theia-notebook-cell-editor' id={uri.toString()}></div>;

}
