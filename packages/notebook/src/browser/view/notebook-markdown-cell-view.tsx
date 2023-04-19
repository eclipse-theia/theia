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
import { MarkdownRenderer } from '@theia/core/lib/browser/markdown-rendering/markdown-renderer';
import { MarkdownStringImpl } from '@theia/core/lib/common/markdown-rendering/markdown-string';
import { NotebookModel } from '../view-model/notebook-model';
import { Cellrenderer } from './notebook-cell-list-view';
import { NotebookCellModel } from '../view-model/notebook-cell-model';
import { Editor } from './notebook-cell-editor';
import { MonacoEditorProvider } from '@theia/monaco/lib/browser/monaco-editor-provider';
import { inject, injectable } from '@theia/core/shared/inversify';

@injectable()
export class NotebookMarkdownCellRenderer implements Cellrenderer {

    @inject(MarkdownRenderer)
    private readonly markdownRenderer: MarkdownRenderer;
    @inject(MonacoEditorProvider)
    private readonly editorProvider: MonacoEditorProvider;

    render(notebookModel: NotebookModel, cell: NotebookCellModel): React.ReactNode {
        return <MarkdownCell markdownRenderer={this.markdownRenderer} editorProvider={this.editorProvider} cell={cell} notebookModel={notebookModel} />;
    }

}

interface MarkdownCellProps {
    markdownRenderer: MarkdownRenderer,
    editorProvider: MonacoEditorProvider,

    cell: NotebookCellModel,
    notebookModel: NotebookModel
}

function MarkdownCell({ markdownRenderer, editorProvider, cell, notebookModel }: MarkdownCellProps): JSX.Element {
    const markdownNode = markdownRenderer.render(new MarkdownStringImpl(cell.source)).element;

    const [editMode, setEditMode] = React.useState(false);

    React.useEffect(() => {
        const listener = cell.onRequestCellEdit(() => setEditMode(true));
        return () => listener.dispose();
    }, [editMode]);

    return <div>
        {editMode ?
            <Editor cell={cell} editorProvider={editorProvider} notebookModel={notebookModel} /> :
            <div
                // allready sanitized by markdown renderer
                dangerouslySetInnerHTML={{ __html: markdownNode.innerHTML }} // eslint-disable-line react/no-danger
            />}
    </div>;
}
