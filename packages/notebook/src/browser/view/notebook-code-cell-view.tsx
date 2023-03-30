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

import { URI } from '@theia/core';
import * as React from '@theia/core/shared/react';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { CellDto, CellUri } from '../../common';
import { NotebookModel } from '../view-model/notebook-model';
import { Cellrenderer } from './notebook-cell-list-view';

export class NotebookCodeCellRenderer implements Cellrenderer {

    constructor(private editorProvider: MonacoEditorProvider, private notebookUri: URI) { }

    render(notebookModel: NotebookModel, cell: CellDto, handle: number): React.ReactNode {
        return <div>
            <Editor notebookModel={notebookModel} editorProvider={this.editorProvider} uri={this.createCellUri(cell, handle)} cell={cell}></Editor>
            {cell.outputs && cell.outputs.flatMap(output => output.outputs.map(item => <div>{new TextDecoder().decode(item.data.buffer)}</div>))}
        </div >;
    }

    private createCellUri(cell: CellDto, handle: number): URI {
        return CellUri.generate(this.notebookUri, handle);
    }
}

interface EditorProps {
    notebookModel: NotebookModel,
    editorProvider: MonacoEditorProvider,
    uri: URI,
    cell: CellDto
}

function Editor({ notebookModel, editorProvider, uri, cell }: EditorProps): JSX.Element {
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
